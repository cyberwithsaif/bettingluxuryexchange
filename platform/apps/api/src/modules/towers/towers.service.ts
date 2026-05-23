import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { AdminService } from "../admin/admin.service";
import { Prisma, LedgerKind, TowersStatus, TowersDifficulty } from "@prisma/client";
import * as crypto from "crypto";

const DIFFICULTY_CONFIG: Record<TowersDifficulty, { columns: number; safeTiles: number; bombCount: number }> = {
  EASY:   { columns: 3, safeTiles: 2, bombCount: 1 },
  MEDIUM: { columns: 3, safeTiles: 1, bombCount: 2 },
  HARD:   { columns: 4, safeTiles: 1, bombCount: 3 },
  EXPERT: { columns: 5, safeTiles: 1, bombCount: 4 },
};

const LEVELS = 8;

function generateBombPositions(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  levels: number,
  columns: number,
  bombCount: number,
): number[][] {
  const result: number[][] = [];
  for (let row = 0; row < levels; row++) {
    const bombs: number[] = [];
    const available = Array.from({ length: columns }, (_, i) => i);
    let attempt = 0;
    while (bombs.length < bombCount) {
      const hash = crypto
        .createHmac("sha256", serverSeed)
        .update(`${clientSeed}:${nonce}:${row}:${attempt}`)
        .digest("hex");
      for (let i = 0; i < Math.floor(hash.length / 8) && bombs.length < bombCount; i++) {
        const chunk = hash.substring(i * 8, i * 8 + 8);
        const val = parseInt(chunk, 16);
        const float = val / 0x100000000;
        const idx = Math.floor(float * available.length);
        bombs.push(available[idx]!);
        available.splice(idx, 1);
      }
      attempt++;
    }
    result.push(bombs);
  }
  return result;
}

function calcMultiplier(level: number, columns: number, safeTiles: number, houseEdge: number): number {
  if (level === 0) return 1.0;
  const fair = Math.pow(columns / safeTiles, level);
  return Math.floor(fair * (1 - houseEdge) * 100) / 100;
}

@Injectable()
export class TowersService {
  private readonly logger = new Logger(TowersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly adminService: AdminService,
  ) {}

  private async getConfig() {
    const s = await this.adminService.getPlatformSettings() as any;
    return {
      houseEdge: Number(s.towersHouseEdge ?? 0.02),
      minBet:    Number(s.towersMinBet ?? 10),
      maxBet:    Number(s.towersMaxBet ?? 100_000),
      enabled:   s.towersEnabled !== false,
    };
  }

  async startGame(userId: string, betAmount: number, difficulty: TowersDifficulty, clientSeed: string) {
    const cfg = await this.getConfig();
    if (!cfg.enabled)                throw new BadRequestException("Towers is currently disabled");
    if (betAmount < cfg.minBet)      throw new BadRequestException(`Minimum bet is ₹${cfg.minBet}`);
    if (betAmount > cfg.maxBet)      throw new BadRequestException(`Maximum bet is ₹${cfg.maxBet}`);
    if (!clientSeed?.trim())         throw new BadRequestException("Client seed required");

    const existing = await this.prisma.towersSession.findFirst({
      where: { userId, status: TowersStatus.IN_PROGRESS },
    });
    if (existing) throw new BadRequestException("You have an active game — cashout first");

    const { columns, safeTiles, bombCount } = DIFFICULTY_CONFIG[difficulty];

    await this.wallet.applyLedger({
      userId,
      amount:  -betAmount,
      kind:    LedgerKind.CASINO_BET,
      refType: "towers_bet",
      refId:   "pending",
      note:    `Towers bet (${difficulty})`,
    });

    const serverSeed     = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const nonce          = 1;
    const bombPositions  = generateBombPositions(serverSeed, clientSeed, nonce, LEVELS, columns, bombCount);

    const session = await this.prisma.towersSession.create({
      data: {
        userId,
        betAmount:     new Prisma.Decimal(betAmount),
        difficulty,
        columns,
        safeTiles,
        bombCount,
        levels:        LEVELS,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        status:        TowersStatus.IN_PROGRESS,
        currentLevel:  0,
        multiplier:    new Prisma.Decimal(1.0),
        bombPositions,
        pickedCols:    [],
      },
    });

    await this.prisma.ledgerEntry.updateMany({
      where: { userId, refType: "towers_bet", refId: "pending" },
      data:  { refId: session.id },
    });

    const multiplierTable = Array.from({ length: LEVELS }, (_, i) =>
      calcMultiplier(i + 1, columns, safeTiles, cfg.houseEdge),
    );

    return {
      id: session.id, betAmount, difficulty, columns, safeTiles, bombCount,
      levels: LEVELS, serverSeedHash, clientSeed, nonce,
      status: session.status, currentLevel: 0, multiplier: 1.0,
      multiplierTable, pickedCols: [],
    };
  }

  async pickTile(userId: string, sessionId: string, col: number) {
    const session = await this.prisma.towersSession.findUnique({ where: { id: sessionId } });
    if (!session)                                            throw new BadRequestException("Session not found");
    if (session.userId !== userId)                          throw new BadRequestException("Unauthorized");
    if (session.status !== TowersStatus.IN_PROGRESS)        throw new BadRequestException("Game is not in progress");
    if (col < 0 || col >= session.columns)                  throw new BadRequestException("Invalid tile");
    if (session.currentLevel >= session.levels)             throw new BadRequestException("Game already complete");

    const bombPositions = session.bombPositions as number[][];
    const pickedCols    = session.pickedCols as number[];
    const rowBombs      = bombPositions[session.currentLevel]!;
    const isBomb        = rowBombs.includes(col);

    if (isBomb) {
      await this.prisma.towersSession.update({
        where: { id: sessionId },
        data:  { status: TowersStatus.BUSTED, settledAt: new Date(), pickedCols: [...pickedCols, col] },
      });
      return {
        isBomb: true as const, col, row: session.currentLevel,
        rowBombs, status: TowersStatus.BUSTED,
        bombPositions, serverSeed: session.serverSeed,
        multiplier: 0, payout: 0,
      };
    }

    const cfg          = await this.getConfig();
    const newLevel     = session.currentLevel + 1;
    const newMult      = calcMultiplier(newLevel, session.columns, session.safeTiles, cfg.houseEdge);
    const newPicked    = [...pickedCols, col];
    const isComplete   = newLevel >= session.levels;

    if (isComplete) {
      return this.cashoutInternal(session, newPicked, newMult, true);
    }

    await this.prisma.towersSession.update({
      where: { id: sessionId },
      data:  { currentLevel: newLevel, multiplier: new Prisma.Decimal(newMult), pickedCols: newPicked },
    });

    return {
      isBomb: false as const, col, row: session.currentLevel,
      status: TowersStatus.IN_PROGRESS, currentLevel: newLevel,
      multiplier: newMult, pickedCols: newPicked,
    };
  }

  async cashout(userId: string, sessionId: string) {
    const session = await this.prisma.towersSession.findUnique({ where: { id: sessionId } });
    if (!session)                                       throw new BadRequestException("Session not found");
    if (session.userId !== userId)                      throw new BadRequestException("Unauthorized");
    if (session.status !== TowersStatus.IN_PROGRESS)    throw new BadRequestException("Game is not in progress");
    const pickedCols = session.pickedCols as number[];
    if (pickedCols.length === 0)                        throw new BadRequestException("Clear at least one level first");
    return this.cashoutInternal(session, pickedCols, Number(session.multiplier), false);
  }

  private async cashoutInternal(session: any, pickedCols: number[], multiplier: number, isAutoWin: boolean) {
    const payout = Number(session.betAmount) * multiplier;
    await this.prisma.towersSession.update({
      where: { id: session.id },
      data: {
        status: TowersStatus.CASHED_OUT, multiplier: new Prisma.Decimal(multiplier),
        payout: new Prisma.Decimal(payout), settledAt: new Date(), pickedCols,
      },
    });
    await this.wallet.applyLedger({
      userId:  session.userId, amount: payout,
      kind:    LedgerKind.CASINO_WIN, refType: "towers_win",
      refId:   session.id, note: `Towers cashout ${multiplier}x`,
    });
    return {
      isBomb: false as const, status: TowersStatus.CASHED_OUT,
      multiplier, payout, bombPositions: session.bombPositions,
      serverSeed: session.serverSeed,
    };
  }

  async getActiveSession(userId: string) {
    const session = await this.prisma.towersSession.findFirst({
      where: { userId, status: TowersStatus.IN_PROGRESS },
    });
    if (!session) return null;
    const cfg = await this.getConfig();
    const multiplierTable = Array.from({ length: session.levels }, (_, i) =>
      calcMultiplier(i + 1, session.columns, session.safeTiles, cfg.houseEdge),
    );
    return {
      id: session.id, betAmount: Number(session.betAmount), difficulty: session.difficulty,
      columns: session.columns, safeTiles: session.safeTiles, bombCount: session.bombCount,
      levels: session.levels, serverSeedHash: session.serverSeedHash,
      clientSeed: session.clientSeed, nonce: session.nonce, status: session.status,
      currentLevel: session.currentLevel, multiplier: Number(session.multiplier),
      multiplierTable, pickedCols: session.pickedCols,
    };
  }

  async getRecentResults(limit = 20) {
    const rows = await this.prisma.towersSession.findMany({
      where:   { status: { in: [TowersStatus.CASHED_OUT, TowersStatus.BUSTED] } },
      orderBy: { settledAt: "desc" },
      take:    limit,
      include: { user: { select: { username: true } } },
    });
    return rows.map(s => ({
      id: s.id, username: s.user.username, betAmount: Number(s.betAmount),
      multiplier: Number(s.multiplier), payout: Number(s.payout),
      difficulty: s.difficulty, level: (s.pickedCols as any[]).length,
      status: s.status, createdAt: s.createdAt,
    }));
  }

  async getUserBets(userId: string, limit = 50) {
    return this.prisma.towersSession.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, take: limit,
    });
  }

  async getAdminStats() {
    const [total, active, wins, busts] = await Promise.all([
      this.prisma.towersSession.count(),
      this.prisma.towersSession.count({ where: { status: TowersStatus.IN_PROGRESS } }),
      this.prisma.towersSession.findMany({ where: { status: TowersStatus.CASHED_OUT }, select: { betAmount: true, payout: true } }),
      this.prisma.towersSession.findMany({ where: { status: TowersStatus.BUSTED }, select: { betAmount: true } }),
    ]);
    const vol     = [...wins.map(w => Number(w.betAmount)), ...busts.map(b => Number(b.betAmount))].reduce((a, v) => a + v, 0);
    const payouts = wins.reduce((a, w) => a + Number(w.payout), 0);
    return { total, active, totalBetsVol: vol, totalPayouts: payouts, houseProfit: vol - payouts };
  }

  async getAdminHistory(opts: { limit?: number; skip?: number; status?: string; username?: string }) {
    const where: any = {};
    if (opts.status && opts.status !== "ALL") where.status = opts.status;
    if (opts.username) where.user = { username: { contains: opts.username, mode: "insensitive" } };
    return this.prisma.towersSession.findMany({
      where, include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" }, take: opts.limit ?? 50, skip: opts.skip ?? 0,
    });
  }

  async expireStale(maxAgeMinutes = 120) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
    const stale  = await this.prisma.towersSession.findMany({
      where: { status: TowersStatus.IN_PROGRESS, createdAt: { lt: cutoff } }, select: { id: true },
    });
    if (!stale.length) return { expired: 0 };
    await this.prisma.towersSession.updateMany({
      where: { id: { in: stale.map(s => s.id) } },
      data:  { status: TowersStatus.BUSTED, settledAt: new Date() },
    });
    return { expired: stale.length };
  }
}
