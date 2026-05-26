import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { AdminService } from "../admin/admin.service";
import { Prisma, LedgerKind, ChickenRoadStatus, ChickenRoadDifficulty } from "@prisma/client";
import * as crypto from "crypto";

// Per-difficulty: how many lanes the road has and the chance a vehicle hits
// the chicken on any given lane. Higher death chance → steeper multiplier growth.
const DIFFICULTY_CONFIG: Record<ChickenRoadDifficulty, { lanes: number; deathProb: number }> = {
  EASY:      { lanes: 20, deathProb: 0.06 },
  MEDIUM:    { lanes: 18, deathProb: 0.12 },
  HARD:      { lanes: 16, deathProb: 0.20 },
  DAREDEVIL: { lanes: 14, deathProb: 0.30 },
};

// Deterministic per-lane outcome from the provably-fair seeds. A lane is
// "deadly" when its derived float falls below the difficulty death chance.
function generateDeadlyLanes(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  lanes: number,
  deathProb: number,
): boolean[] {
  const result: boolean[] = [];
  for (let lane = 0; lane < lanes; lane++) {
    const hash = crypto
      .createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}:${lane}`)
      .digest("hex");
    const val = parseInt(hash.substring(0, 8), 16);
    const float = val / 0x100000000;
    result.push(float < deathProb);
  }
  return result;
}

// Cumulative multiplier after safely crossing `lanesCrossed` lanes.
// Fair payout is 1 / survivalProb^n, trimmed by the house edge.
function calcMultiplier(lanesCrossed: number, deathProb: number, houseEdge: number): number {
  if (lanesCrossed === 0) return 1.0;
  const survival = 1 - deathProb;
  const fair = Math.pow(1 / survival, lanesCrossed);
  return Math.floor(fair * (1 - houseEdge) * 100) / 100;
}

@Injectable()
export class ChickenRoadService {
  private readonly logger = new Logger(ChickenRoadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly adminService: AdminService,
  ) {}

  private async getConfig() {
    const s = (await this.adminService.getPlatformSettings()) as any;
    return {
      houseEdge: Number(s.chickenRoadHouseEdge ?? 0.03),
      minBet:    Number(s.chickenRoadMinBet    ?? 10),
      maxBet:    Number(s.chickenRoadMaxBet    ?? 100_000),
      enabled:   s.chickenRoadEnabled !== false,
    };
  }

  private multiplierTable(lanes: number, deathProb: number, houseEdge: number): number[] {
    return Array.from({ length: lanes }, (_, i) => calcMultiplier(i + 1, deathProb, houseEdge));
  }

  async startGame(
    userId: string,
    betAmount: number,
    difficulty: ChickenRoadDifficulty,
    clientSeed: string,
  ) {
    const cfg = await this.getConfig();
    if (!cfg.enabled)           throw new BadRequestException("Chicken Road is currently disabled");
    if (betAmount < cfg.minBet) throw new BadRequestException(`Minimum bet is ₹${cfg.minBet}`);
    if (betAmount > cfg.maxBet) throw new BadRequestException(`Maximum bet is ₹${cfg.maxBet}`);
    if (!clientSeed?.trim())    throw new BadRequestException("Client seed required");

    const existing = await this.prisma.chickenRoadSession.findFirst({
      where: { userId, status: ChickenRoadStatus.IN_PROGRESS },
    });
    if (existing) throw new BadRequestException("You have an active game — cashout first");

    const { lanes, deathProb } = DIFFICULTY_CONFIG[difficulty];

    await this.wallet.applyLedger({
      userId,
      amount:  -betAmount,
      kind:    LedgerKind.CASINO_BET,
      refType: "chicken_road_bet",
      refId:   "pending",
      note:    `Chicken Road bet (${difficulty})`,
    });

    const serverSeed     = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const nonce          = 1;
    const deadlyLanes    = generateDeadlyLanes(serverSeed, clientSeed, nonce, lanes, deathProb);

    const session = await this.prisma.chickenRoadSession.create({
      data: {
        userId,
        betAmount:      new Prisma.Decimal(betAmount),
        difficulty,
        lanes,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        status:         ChickenRoadStatus.IN_PROGRESS,
        currentLane:    0,
        multiplier:     new Prisma.Decimal(1.0),
        deadlyLanes,
      },
    });

    await this.prisma.ledgerEntry.updateMany({
      where: { userId, refType: "chicken_road_bet", refId: "pending" },
      data:  { refId: session.id },
    });

    return {
      id: session.id, betAmount, difficulty, lanes,
      serverSeedHash, clientSeed, nonce,
      status: session.status, currentLane: 0, multiplier: 1.0,
      multiplierTable: this.multiplierTable(lanes, deathProb, cfg.houseEdge),
    };
  }

  // Advance the chicken one lane forward.
  async move(userId: string, sessionId: string) {
    const session = await this.prisma.chickenRoadSession.findUnique({ where: { id: sessionId } });
    if (!session)                                          throw new BadRequestException("Session not found");
    if (session.userId !== userId)                         throw new BadRequestException("Unauthorized");
    if (session.status !== ChickenRoadStatus.IN_PROGRESS)  throw new BadRequestException("Game is not in progress");
    if (session.currentLane >= session.lanes)              throw new BadRequestException("Already at the end");

    const deadlyLanes = session.deadlyLanes as boolean[];
    const targetLane  = session.currentLane; // lane index being entered
    const isDead      = deadlyLanes[targetLane] === true;

    if (isDead) {
      await this.prisma.chickenRoadSession.update({
        where: { id: sessionId },
        data:  { status: ChickenRoadStatus.BUSTED, settledAt: new Date() },
      });
      return {
        crashed: true as const, lane: targetLane,
        status: ChickenRoadStatus.BUSTED,
        deadlyLanes, serverSeed: session.serverSeed,
        multiplier: 0, payout: 0,
      };
    }

    const cfg          = await this.getConfig();
    const { deathProb } = DIFFICULTY_CONFIG[session.difficulty];
    const newLane      = session.currentLane + 1;
    const newMult      = calcMultiplier(newLane, deathProb, cfg.houseEdge);
    const isComplete   = newLane >= session.lanes;

    if (isComplete) {
      return this.cashoutInternal(session, newMult);
    }

    await this.prisma.chickenRoadSession.update({
      where: { id: sessionId },
      data:  { currentLane: newLane, multiplier: new Prisma.Decimal(newMult) },
    });

    return {
      crashed: false as const, lane: targetLane,
      status: ChickenRoadStatus.IN_PROGRESS,
      currentLane: newLane, multiplier: newMult,
    };
  }

  async cashout(userId: string, sessionId: string) {
    const session = await this.prisma.chickenRoadSession.findUnique({ where: { id: sessionId } });
    if (!session)                                          throw new BadRequestException("Session not found");
    if (session.userId !== userId)                         throw new BadRequestException("Unauthorized");
    if (session.status !== ChickenRoadStatus.IN_PROGRESS)  throw new BadRequestException("Game is not in progress");
    if (session.currentLane === 0)                         throw new BadRequestException("Cross at least one lane first");
    return this.cashoutInternal(session, Number(session.multiplier));
  }

  private async cashoutInternal(session: any, multiplier: number) {
    const payout = Number(session.betAmount) * multiplier;
    await this.prisma.chickenRoadSession.update({
      where: { id: session.id },
      data: {
        status: ChickenRoadStatus.CASHED_OUT,
        multiplier: new Prisma.Decimal(multiplier),
        payout: new Prisma.Decimal(payout),
        settledAt: new Date(),
      },
    });
    await this.wallet.applyLedger({
      userId:  session.userId, amount: payout,
      kind:    LedgerKind.CASINO_WIN, refType: "chicken_road_win",
      refId:   session.id, note: `Chicken Road cashout ${multiplier}x`,
    });
    return {
      crashed: false as const, status: ChickenRoadStatus.CASHED_OUT,
      multiplier, payout, deadlyLanes: session.deadlyLanes,
      serverSeed: session.serverSeed,
    };
  }

  async getActiveSession(userId: string) {
    const session = await this.prisma.chickenRoadSession.findFirst({
      where: { userId, status: ChickenRoadStatus.IN_PROGRESS },
    });
    if (!session) return null;
    const cfg = await this.getConfig();
    const { deathProb } = DIFFICULTY_CONFIG[session.difficulty];
    return {
      id: session.id, betAmount: Number(session.betAmount), difficulty: session.difficulty,
      lanes: session.lanes, serverSeedHash: session.serverSeedHash,
      clientSeed: session.clientSeed, nonce: session.nonce, status: session.status,
      currentLane: session.currentLane, multiplier: Number(session.multiplier),
      multiplierTable: this.multiplierTable(session.lanes, deathProb, cfg.houseEdge),
    };
  }

  async getRecentResults(limit = 20) {
    const rows = await this.prisma.chickenRoadSession.findMany({
      where:   { status: { in: [ChickenRoadStatus.CASHED_OUT, ChickenRoadStatus.BUSTED] } },
      orderBy: { settledAt: "desc" },
      take:    limit,
      include: { user: { select: { username: true } } },
    });
    return rows.map(s => ({
      id: s.id, username: s.user.username, betAmount: Number(s.betAmount),
      multiplier: Number(s.multiplier), payout: Number(s.payout),
      difficulty: s.difficulty, lane: s.currentLane,
      status: s.status, createdAt: s.createdAt,
    }));
  }

  async getUserBets(userId: string, limit = 50) {
    return this.prisma.chickenRoadSession.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, take: limit,
    });
  }

  async getAdminStats() {
    const [total, active, wins, busts] = await Promise.all([
      this.prisma.chickenRoadSession.count(),
      this.prisma.chickenRoadSession.count({ where: { status: ChickenRoadStatus.IN_PROGRESS } }),
      this.prisma.chickenRoadSession.findMany({ where: { status: ChickenRoadStatus.CASHED_OUT }, select: { betAmount: true, payout: true } }),
      this.prisma.chickenRoadSession.findMany({ where: { status: ChickenRoadStatus.BUSTED }, select: { betAmount: true } }),
    ]);
    const vol     = [...wins.map(w => Number(w.betAmount)), ...busts.map(b => Number(b.betAmount))].reduce((a, v) => a + v, 0);
    const payouts = wins.reduce((a, w) => a + Number(w.payout), 0);
    return { total, active, totalBetsVol: vol, totalPayouts: payouts, houseProfit: vol - payouts };
  }

  async getAdminHistory(opts: { limit?: number; skip?: number; status?: string; username?: string }) {
    const where: any = {};
    if (opts.status && opts.status !== "ALL") where.status = opts.status;
    if (opts.username) where.user = { username: { contains: opts.username, mode: "insensitive" } };
    return this.prisma.chickenRoadSession.findMany({
      where, include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" }, take: opts.limit ?? 50, skip: opts.skip ?? 0,
    });
  }

  async expireStale(maxAgeMinutes = 120) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
    const stale  = await this.prisma.chickenRoadSession.findMany({
      where: { status: ChickenRoadStatus.IN_PROGRESS, createdAt: { lt: cutoff } }, select: { id: true },
    });
    if (!stale.length) return { expired: 0 };
    await this.prisma.chickenRoadSession.updateMany({
      where: { id: { in: stale.map(s => s.id) } },
      data:  { status: ChickenRoadStatus.BUSTED, settledAt: new Date() },
    });
    return { expired: stale.length };
  }
}
