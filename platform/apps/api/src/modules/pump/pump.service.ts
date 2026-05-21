import { Injectable, Logger, BadRequestException, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { PumpGateway } from "./pump.gateway";
import { Prisma, LedgerKind, PumpRoundStatus } from "@prisma/client";
import * as crypto from "crypto";

// ── Timing constants ────────────────────────────────────────────
const BETTING_MS = 10_000; // 10 s betting window
const RESULT_MS  =  5_000; //  5 s to view crash before next round

// ── Multiplier growth: e^(0.045 * t_seconds) ───────────────────
function multiplierAtMs(elapsedMs: number): number {
  return Math.round(Math.exp(0.045 * (elapsedMs / 1000)) * 100) / 100;
}

function msForMultiplier(m: number): number {
  return (Math.log(Math.max(m, 1.001)) / 0.045) * 1000;
}

export interface PumpConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  maxPayout: number;
  rtpPercent: number;     // 80–100; scales crash probability
  autoCashLimit: number;  // max multiplier for auto-cashout
  forceNextCrash: number | null; // admin override: force crash at this multiplier
}

const DEFAULT_CONFIG: PumpConfig = {
  enabled: true,
  minBet: 10,
  maxBet: 100_000,
  maxPayout: 5_000_000,
  rtpPercent: 97,
  autoCashLimit: 100,
  forceNextCrash: null,
};

@Injectable()
export class PumpService implements OnModuleInit {
  private readonly logger = new Logger(PumpService.name);
  private config: PumpConfig = { ...DEFAULT_CONFIG };

  private currentRoundId: string | null = null;
  private flyingStartedAt: number | null = null;
  private currentCrashPoint: number | null = null;
  private crashTimer: ReturnType<typeof setTimeout> | null = null;
  private autoCashTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly gateway: PumpGateway,
  ) {}

  async onModuleInit() {
    await this.loadConfig();
    // Settle any lingering round from a previous process restart
    await this.prisma.pumpRound.updateMany({
      where: { status: { in: [PumpRoundStatus.BETTING, PumpRoundStatus.FLYING] } },
      data: { status: PumpRoundStatus.SETTLED, settledAt: new Date() },
    });
    setTimeout(() => this.runLoop(), 2_000);
  }

  // ── Loop ──────────────────────────────────────────────────────

  private async runLoop() {
    try {
      await this.startBetting();
    } catch (e) {
      this.logger.error(`Pump loop error: ${(e as Error).message}`);
      setTimeout(() => this.runLoop(), 5_000);
    }
  }

  // ── Phase 1: BETTING ─────────────────────────────────────────

  private async startBetting() {
    const config = await this.loadConfig();

    const serverSeed     = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");

    const round = await this.prisma.pumpRound.create({
      data: { status: PumpRoundStatus.BETTING, serverSeed, serverSeedHash },
    });

    this.currentRoundId  = round.id;
    this.flyingStartedAt = null;
    this.currentCrashPoint = null;

    this.gateway.broadcast("pump:betting", {
      roundId:        round.id,
      roundNumber:    round.roundNumber,
      serverSeedHash: round.serverSeedHash,
      endsAt:         Date.now() + BETTING_MS,
    });

    setTimeout(() => this.startFlying(round.id), BETTING_MS);
  }

  // ── Phase 2: FLYING ──────────────────────────────────────────

  private async startFlying(roundId: string) {
    if (this.currentRoundId !== roundId) return;

    const config = await this.loadConfig();
    const round  = await this.prisma.pumpRound.findUnique({ where: { id: roundId } });
    if (!round) return;

    // Determine crash point (admin override or provably fair)
    const crashPoint = config.forceNextCrash != null
      ? Math.max(1.00, config.forceNextCrash)
      : this.generateCrashPoint(round.serverSeed, config.rtpPercent);

    // Clear admin override for next round
    if (config.forceNextCrash != null) {
      await this.saveConfig({ forceNextCrash: null });
    }

    this.flyingStartedAt  = Date.now();
    this.currentCrashPoint = crashPoint;

    await this.prisma.pumpRound.update({
      where: { id: roundId },
      data: {
        status:     PumpRoundStatus.FLYING,
        flyingAt:   new Date(),
        crashPoint: new Prisma.Decimal(crashPoint),
      },
    });

    const crashMs = msForMultiplier(crashPoint);

    // Schedule hard crash
    this.crashTimer = setTimeout(() => this.crashRound(roundId), crashMs);

    // Schedule auto-cashouts for all bets in this round
    const bets = await this.prisma.pumpBet.findMany({
      where: { roundId, autoCashAt: { not: null }, cashOutAt: null, settledAt: null },
    });

    for (const bet of bets) {
      const target = Number(bet.autoCashAt!);
      if (target > 1.00 && target < crashPoint) {
        const delayMs = msForMultiplier(target);
        const timer   = setTimeout(() => this.autoCashOut(bet.id, bet.userId, target), delayMs);
        this.autoCashTimers.set(bet.id, timer);
      }
    }

    this.gateway.broadcast("pump:flying", {
      roundId,
      roundNumber:    round.roundNumber,
      flyingStartedAt: this.flyingStartedAt,
    });
  }

  // ── Phase 3: CRASH ──────────────────────────────────────────

  private async crashRound(roundId: string) {
    if (this.currentRoundId !== roundId) return;
    this.clearTimers();

    const round = await this.prisma.pumpRound.findUnique({ where: { id: roundId } });
    if (!round || round.status !== PumpRoundStatus.FLYING) return;

    const crashPoint = Number(round.crashPoint ?? 1.00);

    await this.prisma.pumpRound.update({
      where: { id: roundId },
      data: { status: PumpRoundStatus.CRASHED, crashedAt: new Date() },
    });

    this.gateway.broadcast("pump:crash", {
      roundId,
      roundNumber: round.roundNumber,
      crashPoint,
      serverSeed:  round.serverSeed, // reveal for provably fair
    });

    // Settle all remaining (uncashed) bets as losses
    const lossBets = await this.prisma.pumpBet.findMany({
      where: { roundId, cashOutAt: null, settledAt: null },
    });

    for (const bet of lossBets) {
      await this.prisma.pumpBet.update({
        where: { id: bet.id },
        data: { isWin: false, payout: 0, settledAt: new Date() },
      });
    }

    await this.prisma.pumpRound.update({
      where: { id: roundId },
      data: { status: PumpRoundStatus.SETTLED, settledAt: new Date() },
    });

    this.gateway.broadcast("pump:settled", {
      roundId,
      roundNumber: round.roundNumber,
      crashPoint,
      losers: lossBets.length,
    });

    this.flyingStartedAt   = null;
    this.currentCrashPoint = null;

    setTimeout(() => this.runLoop(), RESULT_MS);
  }

  // ── Auto-cashout (server-scheduled) ─────────────────────────

  private async autoCashOut(betId: string, userId: string, targetMultiplier: number) {
    this.autoCashTimers.delete(betId);
    try {
      await this.settleCashOut(betId, userId, targetMultiplier);
      this.gateway.broadcast("pump:cashedOut", { betId, userId, multiplier: targetMultiplier, auto: true });
    } catch (e) {
      this.logger.warn(`Auto-cashout failed for ${betId}: ${(e as Error).message}`);
    }
  }

  // ── Manual cashout (player request) ─────────────────────────

  async cashOut(userId: string, roundId: string) {
    if (this.currentRoundId !== roundId) throw new BadRequestException("Wrong round");
    if (!this.flyingStartedAt || !this.currentCrashPoint) {
      throw new BadRequestException("Game not in flying phase");
    }

    const elapsed   = Date.now() - this.flyingStartedAt;
    const multiplier = multiplierAtMs(elapsed);

    if (multiplier >= this.currentCrashPoint) {
      throw new BadRequestException("Too late — balloon already crashed");
    }

    const bet = await this.prisma.pumpBet.findFirst({
      where: { roundId, userId, cashOutAt: null, settledAt: null },
    });
    if (!bet) throw new BadRequestException("No active bet in this round");

    // Cancel pending auto-cashout timer if one existed
    const timer = this.autoCashTimers.get(bet.id);
    if (timer) { clearTimeout(timer); this.autoCashTimers.delete(bet.id); }

    const result = await this.settleCashOut(bet.id, userId, multiplier);
    this.gateway.broadcast("pump:cashedOut", { betId: bet.id, userId, multiplier, auto: false });
    return result;
  }

  // ── Core cashout settlement ───────────────────────────────────

  private async settleCashOut(betId: string, userId: string, multiplier: number) {
    const bet = await this.prisma.pumpBet.findUnique({ where: { id: betId } });
    if (!bet) throw new BadRequestException("Bet not found");
    if (bet.settledAt) throw new BadRequestException("Bet already settled");

    const config  = await this.loadConfig();
    const betAmt  = Number(bet.betAmount);
    const payout  = Math.min(Math.round(betAmt * multiplier * 100) / 100, config.maxPayout);

    await this.prisma.pumpBet.update({
      where: { id: betId },
      data: {
        cashOutAt: new Prisma.Decimal(multiplier),
        payout:    new Prisma.Decimal(payout),
        isWin:     true,
        settledAt: new Date(),
      },
    });

    await this.wallet.applyLedger({
      userId,
      amount:  payout,
      kind:    LedgerKind.CASINO_WIN,
      refType: "pump",
      refId:   betId,
      note:    `Pump cashout ×${multiplier.toFixed(2)}`,
    });

    return { betId, multiplier, payout };
  }

  // ── Place bet ────────────────────────────────────────────────

  async placeBet(userId: string, input: {
    betAmount: number;
    autoCashAt?: number | null;
  }) {
    const config = await this.loadConfig();

    if (!config.enabled) throw new BadRequestException("Pump game is currently disabled");
    if (!this.currentRoundId) throw new BadRequestException("No active round");

    const round = await this.prisma.pumpRound.findUnique({ where: { id: this.currentRoundId } });
    if (!round || round.status !== PumpRoundStatus.BETTING) {
      throw new BadRequestException("Betting phase is closed for this round");
    }

    if (input.betAmount < config.minBet) {
      throw new BadRequestException(`Minimum bet is ₹${config.minBet}`);
    }
    if (input.betAmount > config.maxBet) {
      throw new BadRequestException(`Maximum bet is ₹${config.maxBet}`);
    }

    // Prevent duplicate bets per round
    const existing = await this.prisma.pumpBet.findFirst({
      where: { roundId: this.currentRoundId, userId },
    });
    if (existing) throw new BadRequestException("You already have a bet in this round");

    const autoCashAt = input.autoCashAt != null && input.autoCashAt > 1.01
      ? Math.min(input.autoCashAt, config.autoCashLimit)
      : null;

    await this.wallet.applyLedger({
      userId,
      amount:  -input.betAmount,
      kind:    LedgerKind.CASINO_BET,
      refType: "pump",
      refId:   round.id,
      note:    `Pump bet`,
    });

    const bet = await this.prisma.pumpBet.create({
      data: {
        userId,
        roundId:   round.id,
        betAmount: new Prisma.Decimal(input.betAmount),
        autoCashAt: autoCashAt != null ? new Prisma.Decimal(autoCashAt) : null,
      },
      include: { user: { select: { username: true } } },
    });

    this.gateway.broadcast("pump:betPlaced", {
      betId:     bet.id,
      username:  bet.user.username,
      betAmount: input.betAmount,
      roundId:   round.id,
    });

    return { betId: bet.id, roundId: round.id };
  }

  // ── Provably fair crash point ─────────────────────────────────

  private generateCrashPoint(serverSeed: string, rtpPercent: number): number {
    const hash = crypto.createHmac("sha256", serverSeed).update("pump:v1").digest("hex");
    const h    = parseInt(hash.slice(0, 8), 16) / 0xffffffff;

    // Base formula: 0.99 / (1 - h) gives 99% RTP distribution
    // ~1% of rounds crash at exactly 1.00x (house takes full bet)
    if (h >= 0.99) return 1.00;

    const base   = 0.99 / (1 - h);
    const scaled = base * (rtpPercent / 99);
    return Math.max(1.00, Math.round(scaled * 100) / 100);
  }

  // ── Provably fair verification ────────────────────────────────

  async verifyRound(roundId: string) {
    const round = await this.prisma.pumpRound.findUnique({ where: { id: roundId } });
    if (!round) throw new BadRequestException("Round not found");
    if (round.status !== PumpRoundStatus.SETTLED) {
      throw new BadRequestException("Round not yet settled");
    }

    const config   = await this.loadConfig();
    const hash     = crypto.createHmac("sha256", round.serverSeed).update("pump:v1").digest("hex");
    const h        = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
    const computed = h >= 0.99 ? 1.00 :
      Math.max(1.00, Math.round(0.99 / (1 - h) * (config.rtpPercent / 99) * 100) / 100);
    const seedHashOk = crypto.createHash("sha256").update(round.serverSeed).digest("hex") === round.serverSeedHash;

    return {
      roundId:         round.id,
      roundNumber:     round.roundNumber,
      serverSeed:      round.serverSeed,
      serverSeedHash:  round.serverSeedHash,
      recordedCrash:   Number(round.crashPoint),
      computedCrash:   computed,
      seedHashMatches: seedHashOk,
      crashMatches:    Math.abs(computed - Number(round.crashPoint)) < 0.01,
    };
  }

  // ── Config ────────────────────────────────────────────────────

  async loadConfig(): Promise<PumpConfig> {
    try {
      const row = await this.prisma.systemConfig.findUnique({ where: { key: "pump_config" } });
      if (row) this.config = { ...DEFAULT_CONFIG, ...(row.value as any) };
    } catch { /* use defaults */ }
    return this.config;
  }

  async getConfig(): Promise<PumpConfig> {
    return this.loadConfig();
  }

  async saveConfig(patch: Partial<PumpConfig>) {
    const next = { ...this.config, ...patch };
    await this.prisma.systemConfig.upsert({
      where:  { key: "pump_config" },
      create: { key: "pump_config", value: next as any },
      update: { value: next as any },
    });
    this.config = next;
    return next;
  }

  // ── Queries ───────────────────────────────────────────────────

  async getCurrentRound() {
    if (!this.currentRoundId) return null;
    const round = await this.prisma.pumpRound.findUnique({
      where: { id: this.currentRoundId },
      include: { bets: { select: { id: true, userId: true, betAmount: true, cashOutAt: true, isWin: true }, take: 50 } },
    });
    return {
      ...round,
      flyingStartedAt: this.flyingStartedAt,
      // Do NOT reveal crashPoint while flying
      crashPoint: round?.status === PumpRoundStatus.SETTLED || round?.status === PumpRoundStatus.CRASHED
        ? Number(round.crashPoint) : null,
    };
  }

  async getRecentRounds(limit = 20) {
    const rounds = await this.prisma.pumpRound.findMany({
      where:   { status: PumpRoundStatus.SETTLED },
      orderBy: { settledAt: "desc" },
      take:    Math.min(limit, 50),
      select:  { id: true, roundNumber: true, crashPoint: true, settledAt: true, serverSeedHash: true },
    });
    return rounds.map(r => ({ ...r, crashPoint: Number(r.crashPoint) }));
  }

  async getUserBets(userId: string, limit = 50) {
    const bets = await this.prisma.pumpBet.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      take:    Math.min(limit, 200),
      include: { round: { select: { roundNumber: true, crashPoint: true, status: true } } },
    });
    return bets.map(b => ({
      ...b,
      betAmount:  Number(b.betAmount),
      cashOutAt:  b.cashOutAt ? Number(b.cashOutAt) : null,
      autoCashAt: b.autoCashAt ? Number(b.autoCashAt) : null,
      payout:     Number(b.payout),
      round:      { ...b.round, crashPoint: b.round.crashPoint ? Number(b.round.crashPoint) : null },
    }));
  }

  async getLiveBets(limit = 30) {
    const bets = await this.prisma.pumpBet.findMany({
      orderBy: { createdAt: "desc" },
      take:    Math.min(limit, 50),
      select: {
        id: true, betAmount: true, cashOutAt: true, payout: true, isWin: true, createdAt: true,
        user: { select: { username: true } },
        round: { select: { roundNumber: true, crashPoint: true } },
      },
    });
    return bets.map(b => ({
      ...b,
      betAmount: Number(b.betAmount),
      cashOutAt: b.cashOutAt ? Number(b.cashOutAt) : null,
      payout:    Number(b.payout),
      round:     { ...b.round, crashPoint: b.round.crashPoint ? Number(b.round.crashPoint) : null },
    }));
  }

  // ── Admin stats ───────────────────────────────────────────────

  async getAdminStats() {
    const [totalRounds, totalBets, agg, bigWins] = await Promise.all([
      this.prisma.pumpRound.count({ where: { status: PumpRoundStatus.SETTLED } }),
      this.prisma.pumpBet.count(),
      this.prisma.pumpBet.aggregate({
        _sum: { betAmount: true, payout: true },
        _avg: { betAmount: true, cashOutAt: true },
      }),
      this.prisma.pumpBet.findMany({
        where:   { isWin: true },
        orderBy: { payout: "desc" },
        take:    10,
        include: { user: { select: { username: true } } },
      }),
    ]);

    const hourAgo       = new Date(Date.now() - 3_600_000);
    const activePlayers = await this.prisma.pumpBet.groupBy({
      by:    ["userId"],
      where: { createdAt: { gte: hourAgo } },
    });

    const totalWagered = Number(agg._sum.betAmount ?? 0);
    const totalPaid    = Number(agg._sum.payout ?? 0);

    return {
      totalRounds,
      totalBets,
      totalWagered,
      totalPaid,
      houseProfit:  totalWagered - totalPaid,
      actualRTP:    totalWagered > 0 ? Math.round((totalPaid / totalWagered) * 10000) / 100 : 0,
      avgBet:       Math.round(Number(agg._avg.betAmount ?? 0) * 100) / 100,
      avgCashout:   Math.round(Number(agg._avg.cashOutAt ?? 0) * 100) / 100,
      activePlayers: activePlayers.length,
      currentRound:  this.currentRoundId,
      bigWins: bigWins.map(b => ({
        id:        b.id,
        username:  b.user.username,
        betAmount: Number(b.betAmount),
        cashOutAt: Number(b.cashOutAt),
        payout:    Number(b.payout),
        createdAt: b.createdAt,
      })),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────

  private clearTimers() {
    if (this.crashTimer) { clearTimeout(this.crashTimer); this.crashTimer = null; }
    for (const t of this.autoCashTimers.values()) clearTimeout(t);
    this.autoCashTimers.clear();
  }
}
