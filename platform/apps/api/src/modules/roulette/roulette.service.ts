import { Injectable, Logger, BadRequestException, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RedisService } from "../../common/redis/redis.service";
import { WalletService } from "../wallet/wallet.service";
import { RouletteGateway } from "./roulette.gateway";
import { Prisma, LedgerKind, RouletteRoundStatus } from "@prisma/client";
import * as crypto from "crypto";

const LOOP_LOCK_KEY = "lock:roulette:loop";
const LOOP_LOCK_TTL_SECS = 30;
const LOOP_LOCK_REFRESH_MS = 10_000;
const LOOP_RETRY_MS = 5_000;
const STATE_KEY = "roulette:current";
const STATE_TTL_SECS = 300;

// ── Mini Roulette: 10 numbers (0-9) ──────────────────────────────────────────
const MINI_RED   = new Set([1, 3, 5, 7, 9]);
const MINI_BLACK = new Set([2, 4, 6, 8]);
const WHEEL_SIZE = 10; // 0-9

const BETTING_MS = 15_000; // 15 s — players place bets
const CLOSED_MS  =  3_000; //  3 s — betting closed, "get ready" flash
const SPIN_MS    =  5_000; //  5 s — wheel spinning animation
const RESULT_MS  =  3_000; //  3 s — result display before next round
// Total round: 26 s

export type BetType = "number" | "red" | "black" | "green" | "odd" | "even" | "high" | "low";

export function getColor(n: number): "green" | "red" | "black" {
  if (n === 0) return "green";
  return MINI_RED.has(n) ? "red" : "black";
}

/**
 * Mini Roulette payouts (return including stake):
 *   number (straight-up) → 9x
 *   red  → 2x
 *   black → 2.25x
 *   green (0) → 9x
 *   odd  → 1.95x  (1,3,5,7,9)
 *   even → 2.25x  (2,4,6,8)
 *   low  → 1.95x  (0-4)
 *   high → 1.95x  (5-9)
 */
function calculatePayout(betType: BetType, betValue: string | null, amount: number, n: number): number {
  const color = getColor(n);
  switch (betType) {
    case "number": return Number(betValue) === n ? amount * 9    : 0;
    case "green":  return color === "green"       ? amount * 9    : 0;
    case "red":    return color === "red"         ? amount * 2    : 0;
    case "black":  return color === "black"       ? amount * 2.25 : 0;
    case "odd":    return MINI_RED.has(n)         ? amount * 1.95 : 0;   // 1,3,5,7,9
    case "even":   return MINI_BLACK.has(n)       ? amount * 2.25 : 0;   // 2,4,6,8
    case "low":    return n >= 0 && n <= 4        ? amount * 1.95 : 0;   // 0,1,2,3,4
    case "high":   return n >= 5 && n <= 9        ? amount * 1.95 : 0;   // 5,6,7,8,9
    default:       return 0;
  }
}

@Injectable()
export class RouletteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RouletteService.name);
  private currentRoundId: string | null = null;
  private phaseEndsAt = 0;
  private readonly lockValue = `${process.env.NODE_APP_INSTANCE ?? "0"}:${process.pid}`;
  private lockRefreshTimer: NodeJS.Timeout | null = null;
  private hasLock = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wallet: WalletService,
    private readonly gateway: RouletteGateway,
  ) {}

  async onModuleInit() {
    setTimeout(() => this.tryAcquireLoop(), 2000 + Math.floor(Math.random() * 1000));
  }

  async onModuleDestroy() {
    if (this.lockRefreshTimer) clearInterval(this.lockRefreshTimer);
    if (this.hasLock) {
      await this.redis.client.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
        1, LOOP_LOCK_KEY, this.lockValue,
      ).catch(() => {});
    }
  }

  private async tryAcquireLoop() {
    try {
      const acquired = await this.redis.client.set(LOOP_LOCK_KEY, this.lockValue, "EX", LOOP_LOCK_TTL_SECS, "NX");
      if (acquired !== "OK") {
        setTimeout(() => this.tryAcquireLoop(), LOOP_RETRY_MS);
        return;
      }
      this.hasLock = true;
      this.logger.log(`Acquired roulette loop lock (worker ${this.lockValue})`);
      this.lockRefreshTimer = setInterval(async () => {
        const ok = await this.redis.client.eval(
          `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end`,
          1, LOOP_LOCK_KEY, this.lockValue, LOOP_LOCK_TTL_SECS.toString(),
        ).catch(() => 0);
        if (ok !== 1) {
          this.logger.warn("Lost roulette loop lock — backing off");
          this.hasLock = false;
          if (this.lockRefreshTimer) { clearInterval(this.lockRefreshTimer); this.lockRefreshTimer = null; }
          setTimeout(() => this.tryAcquireLoop(), LOOP_RETRY_MS);
        }
      }, LOOP_LOCK_REFRESH_MS);
      await this.startLoop();
    } catch (e) {
      this.logger.error(`tryAcquireLoop error: ${(e as Error).message}`);
      setTimeout(() => this.tryAcquireLoop(), LOOP_RETRY_MS);
    }
  }

  async startLoop() {
    try {
      await this.startNewRound();
    } catch (e) {
      this.logger.error(`Roulette loop error: ${(e as Error).message}`);
      setTimeout(() => this.startLoop(), LOOP_RETRY_MS);
    }
  }

  async startNewRound() {
    const serverSeed = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");

    const round = await this.prisma.rouletteRound.create({
      data: { status: RouletteRoundStatus.BETTING, serverSeed, serverSeedHash },
    });

    await this.publishState(round.id, Date.now() + BETTING_MS, "BETTING");

    this.gateway.broadcast("roulette:newRound", {
      roundId: round.id,
      roundNumber: round.roundNumber,
      serverSeedHash: round.serverSeedHash,
      status: "BETTING",
      phaseEndsAt: this.phaseEndsAt,
    });

    setTimeout(() => this.closeBetting(round.id), BETTING_MS);
  }

  /** Betting-closed flash phase: 3 s before wheel spins */
  private async closeBetting(roundId: string) {
    if (this.currentRoundId !== roundId) return;
    await this.publishState(roundId, Date.now() + CLOSED_MS, "CLOSED");
    this.gateway.broadcast("roulette:bettingClosed", { roundId, phaseEndsAt: this.phaseEndsAt });
    setTimeout(() => this.startSpin(roundId), CLOSED_MS);
  }

  // ── Admin RTP / force-number config ──────────────────────────────────────
  private static readonly CONFIG_KEY = "roulette_config";

  async getConfig() {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: RouletteService.CONFIG_KEY } });
    const v = (row?.value ?? {}) as Record<string, unknown>;
    const fn = v.forceNumber == null ? NaN : Number(v.forceNumber);
    return {
      rtpPercent:  Number(v.rtpPercent  ?? 97),
      minBet:      Number(v.minBet      ?? 10),
      maxBet:      Number(v.maxBet      ?? 100_000),
      maxPayout:   Number(v.maxPayout   ?? 0),
      enabled:     v.enabled !== false,
      // force number: 0-9 only (Mini Roulette)
      forceNumber: Number.isInteger(fn) && fn >= 0 && fn <= 9 ? fn : null,
    };
  }

  async getAdminConfig() { return this.getConfig(); }

  async saveAdminConfig(dto: Record<string, unknown>) {
    const patch: Record<string, unknown> = {};
    if (dto.rtpPercent != null) patch.rtpPercent = Math.max(0, Math.min(200, Number(dto.rtpPercent)));
    if (dto.minBet     != null) patch.minBet     = Math.max(1, Number(dto.minBet));
    if (dto.maxBet     != null) patch.maxBet     = Math.max(1, Number(dto.maxBet));
    if (dto.maxPayout  != null) patch.maxPayout  = Math.max(0, Number(dto.maxPayout));
    if (dto.enabled    != null) patch.enabled    = !!dto.enabled;
    if ("forceNumber" in dto) {
      const n = Number(dto.forceNumber);
      patch.forceNumber = dto.forceNumber === null || !Number.isInteger(n) || n < 0 || n > 9 ? null : n;
    }
    const cur = ((await this.prisma.systemConfig.findUnique({ where: { key: RouletteService.CONFIG_KEY } }))?.value as Record<string, unknown>) ?? {};
    const merged = { ...cur, ...patch };
    await this.prisma.systemConfig.upsert({
      where:  { key: RouletteService.CONFIG_KEY },
      create: { key: RouletteService.CONFIG_KEY, value: merged as Prisma.InputJsonValue },
      update: { value: merged as Prisma.InputJsonValue },
    });
    return this.getConfig();
  }

  private async clearForceNumber() {
    const cur = ((await this.prisma.systemConfig.findUnique({ where: { key: RouletteService.CONFIG_KEY } }))?.value as Record<string, unknown>) ?? {};
    if (cur.forceNumber == null) return;
    await this.prisma.systemConfig.update({
      where: { key: RouletteService.CONFIG_KEY },
      data:  { value: { ...cur, forceNumber: null } as Prisma.InputJsonValue },
    });
  }

  /**
   * Pick winning number (0-9). Priority:
   *  1. Admin forced number (one-shot — consumed after this spin).
   *  2. RTP-biased: provably-fair seed still drives the RNG, admin RTP steers
   *     toward house-cheap (RTP<100) or player-rich (RTP>100) numbers.
   *     RTP=100 = uniform fair roll.
   */
  private async chooseWinningNumber(
    serverSeed: string,
    bets: { betType: string; betValue: string | null; amount: Prisma.Decimal }[],
    cfg: { rtpPercent: number; forceNumber: number | null },
  ): Promise<number> {
    if (cfg.forceNumber !== null) {
      await this.clearForceNumber();
      this.logger.log(`Mini Roulette forced number ${cfg.forceNumber}`);
      return cfg.forceNumber;
    }

    const hash  = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const baseN = parseInt(hash.slice(0, 8), 16) % WHEEL_SIZE;

    if (!bets.length || cfg.rtpPercent === 100) return baseN;

    // Payout house would owe for each possible winning number given the book.
    const payouts = Array.from({ length: WHEEL_SIZE }, (_, n) =>
      bets.reduce((s, b) => s + calculatePayout(b.betType as BetType, b.betValue, Number(b.amount), n), 0),
    );
    const ranked = Array.from({ length: WHEEL_SIZE }, (_, n) => n).sort((a, b) => payouts[a]! - payouts[b]!);
    const steer  = (100 - cfg.rtpPercent) / 100;
    const k      = Math.min(0.96, Math.abs(steer) * 3);
    let u        = parseInt(hash.slice(8, 16), 16) / 0x100000000;
    if      (steer > 0) u = Math.pow(u, 1 + k * 10);
    else if (steer < 0) u = 1 - Math.pow(1 - u, 1 + k * 10);
    return ranked[Math.min(WHEEL_SIZE - 1, Math.floor(u * WHEEL_SIZE))]!;
  }

  async startSpin(roundId: string) {
    if (this.currentRoundId !== roundId) return;

    const round = await this.prisma.rouletteRound.findUnique({ where: { id: roundId } });
    if (!round) return;

    const cfg  = await this.getConfig();
    const bets = await this.prisma.rouletteBet.findMany({
      where: { roundId },
      select: { betType: true, betValue: true, amount: true },
    });

    const winningNumber = await this.chooseWinningNumber(round.serverSeed, bets, cfg);
    const winningColor  = getColor(winningNumber);

    await this.prisma.rouletteRound.update({
      where: { id: roundId },
      data:  { status: RouletteRoundStatus.SPINNING, spinAt: new Date() },
    });

    await this.publishState(roundId, Date.now() + SPIN_MS, "SPINNING");

    this.gateway.broadcast("roulette:spin", {
      roundId,
      winningNumber,
      winningColor,
      phaseEndsAt: this.phaseEndsAt,
    });

    setTimeout(() => this.settleRound(roundId, winningNumber, winningColor), SPIN_MS);
  }

  async settleRound(roundId: string, winningNumber: number, winningColor: string) {
    const bets = await this.prisma.rouletteBet.findMany({ where: { roundId } });
    const { maxPayout } = await this.getConfig();

    await this.prisma.rouletteRound.update({
      where: { id: roundId },
      data:  { status: RouletteRoundStatus.SETTLED, winningNumber, winningColor, settledAt: new Date() },
    });

    const settled = [];
    for (const bet of bets) {
      const amount = Number(bet.amount);
      let payout   = calculatePayout(bet.betType as BetType, bet.betValue, amount, winningNumber);
      if (maxPayout > 0 && payout > maxPayout) payout = maxPayout;
      const isWin  = payout > 0;

      await this.prisma.rouletteBet.update({
        where: { id: bet.id },
        data:  { payout, isWin, settledAt: new Date() },
      });

      if (isWin) {
        try {
          await this.wallet.applyLedger({
            userId: bet.userId,
            amount: payout,
            kind:    LedgerKind.CASINO_WIN,
            refType: "roulette_bet",
            refId:   bet.id,
            note:    `Mini Roulette win #${winningNumber} ${winningColor}`,
          });
        } catch (e) {
          this.logger.error(`Failed to pay winner ${bet.userId}: ${(e as Error).message}`);
        }
      }

      settled.push({ betId: bet.id, userId: bet.userId, betType: bet.betType, betValue: bet.betValue, amount, payout, isWin });
    }

    const round = await this.prisma.rouletteRound.findUnique({ where: { id: roundId } });
    await this.publishState(roundId, Date.now() + RESULT_MS, "SETTLED");

    this.gateway.broadcast("roulette:result", {
      roundId,
      winningNumber,
      winningColor,
      serverSeed: round?.serverSeed,
      bets: settled,
      phaseEndsAt: this.phaseEndsAt,
    });

    setTimeout(() => this.startNewRound(), RESULT_MS);
  }

  private async publishState(roundId: string, phaseEndsAt: number, phase: string) {
    this.currentRoundId = roundId;
    this.phaseEndsAt    = phaseEndsAt;
    try {
      await this.redis.client.set(STATE_KEY, JSON.stringify({ roundId, phaseEndsAt, phase }), "EX", STATE_TTL_SECS);
    } catch (e) {
      this.logger.warn(`Failed to publish roulette state: ${(e as Error).message}`);
    }
  }

  private async readState(): Promise<{ roundId: string; phaseEndsAt: number; phase?: string } | null> {
    try {
      const raw = await this.redis.client.get(STATE_KEY);
      if (raw) return JSON.parse(raw) as { roundId: string; phaseEndsAt: number; phase?: string };
    } catch { /* fall through */ }
    if (this.currentRoundId) return { roundId: this.currentRoundId, phaseEndsAt: this.phaseEndsAt };
    return null;
  }

  async placeBet(userId: string, input: { betType: BetType; betValue?: string | null; amount: number }) {
    const state = await this.readState();
    if (!state) throw new BadRequestException("No active round");

    const round = await this.prisma.rouletteRound.findUnique({ where: { id: state.roundId } });
    if (!round) throw new BadRequestException("Round not found");
    if (round.status !== RouletteRoundStatus.BETTING) throw new BadRequestException("Betting is closed for this round");

    const cfg = await this.getConfig();
    if (!cfg.enabled) throw new BadRequestException("Roulette is currently disabled");
    if (input.amount < cfg.minBet) throw new BadRequestException(`Minimum bet is ₹${cfg.minBet.toLocaleString("en-IN")}`);
    if (input.amount > cfg.maxBet) throw new BadRequestException(`Maximum bet is ₹${cfg.maxBet.toLocaleString("en-IN")}`);

    if (input.betType === "number" || input.betType === "green") {
      const n = Number(input.betValue ?? (input.betType === "green" ? "0" : "-1"));
      if (!Number.isInteger(n) || n < 0 || n > 9) throw new BadRequestException("Number must be 0-9");
    }

    await this.wallet.applyLedger({
      userId,
      amount:  -input.amount,
      kind:    LedgerKind.CASINO_BET,
      refType: "roulette_round",
      refId:   round.id,
      note:    `Mini Roulette ${input.betType}${input.betValue ? ` ${input.betValue}` : ""}`,
    });

    const bet = await this.prisma.rouletteBet.create({
      data: {
        userId,
        roundId:  round.id,
        betType:  input.betType,
        betValue: input.betValue ?? null,
        amount:   new Prisma.Decimal(input.amount),
      },
    });

    this.gateway.broadcast("roulette:betPlaced", {
      roundId: round.id,
      betId:   bet.id,
      userId,
      betType: bet.betType,
      amount:  input.amount,
    });

    return { ok: true, betId: bet.id };
  }

  async getCurrentRound() {
    const state = await this.readState();
    if (!state) return null;

    const round = await this.prisma.rouletteRound.findUnique({
      where:   { id: state.roundId },
      include: { bets: { select: { id: true, userId: true, betType: true, betValue: true, amount: true, payout: true, isWin: true } } },
    });
    if (!round) return null;

    return {
      id:             round.id,
      roundNumber:    round.roundNumber,
      status:         round.status,
      phase:          (state as any).phase ?? round.status,
      serverSeedHash: round.serverSeedHash,
      winningNumber:  round.winningNumber,
      winningColor:   round.winningColor,
      phaseEndsAt:    state.phaseEndsAt,
      betsCount:      round.bets.length,
      totalWagered:   round.bets.reduce((s, b) => s + Number(b.amount), 0),
    };
  }

  async getRecentResults(limit = 20) {
    return this.prisma.rouletteRound.findMany({
      where:   { status: RouletteRoundStatus.SETTLED },
      orderBy: { settledAt: "desc" },
      take:    limit,
      select:  { id: true, roundNumber: true, winningNumber: true, winningColor: true, settledAt: true },
    });
  }

  async getUserBets(userId: string, limit = 50) {
    return this.prisma.rouletteBet.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      take:    limit,
      include: { round: { select: { roundNumber: true, winningNumber: true, winningColor: true, status: true } } },
    });
  }
}
