import { Injectable, Logger, BadRequestException, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RedisService } from "../../common/redis/redis.service";
import { WalletService } from "../wallet/wallet.service";
import { RouletteGateway } from "./roulette.gateway";
import { Prisma, LedgerKind, RouletteRoundStatus } from "@prisma/client";
import * as crypto from "crypto";

// Distributed lock so only ONE cluster worker runs the game loop.
// TTL is long enough to absorb GC pauses but short enough that a dead
// worker doesn't strand the loop for long.
const LOOP_LOCK_KEY = "lock:roulette:loop";
const LOOP_LOCK_TTL_SECS = 30;
const LOOP_LOCK_REFRESH_MS = 10_000;
const LOOP_RETRY_MS = 5_000;

// Current-round pointer shared across ALL cluster workers. Only the worker
// holding the loop lock drives the game, but every worker must be able to
// answer GET /current and accept bets — so the active round id + phase
// deadline live in Redis, not only in the loop owner's memory.
const STATE_KEY = "roulette:current";
const STATE_TTL_SECS = 300; // safety net; rewritten on every phase (≤20s apart)

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const BETTING_MS  = 15000;  // 15 seconds to place bets
const SPIN_MS     = 20000;  // 20 seconds spin animation
const RESULT_MS   = 5000;   // 5 seconds to view result before next round

export type BetType =
  | "number" | "red" | "black" | "odd" | "even"
  | "high"   | "low"
  | "dozen1" | "dozen2" | "dozen3"
  | "col1"   | "col2"   | "col3"
  | "split"  | "street" | "corner" | "sixline";

function getColor(n: number): "green" | "red" | "black" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

function parseNums(betValue: string | null): number[] {
  return (betValue ?? "").split("/").map(Number).filter(n => !isNaN(n));
}

function calculatePayout(betType: BetType, betValue: string | null, amount: number, n: number): number {
  const color = getColor(n);
  switch (betType) {
    case "number":  return Number(betValue) === n ? amount * 36 : 0;
    case "split":   return parseNums(betValue).includes(n) ? amount * 18 : 0;  // 17:1
    case "street":  return parseNums(betValue).includes(n) ? amount * 12 : 0;  // 11:1
    case "corner":  return parseNums(betValue).includes(n) ? amount * 9  : 0;  // 8:1
    case "sixline": return parseNums(betValue).includes(n) ? amount * 6  : 0;  // 5:1
    case "red":     return color === "red"   ? amount * 2 : 0;
    case "black":   return color === "black" ? amount * 2 : 0;
    case "odd":     return n !== 0 && n % 2 !== 0 ? amount * 2 : 0;
    case "even":    return n !== 0 && n % 2 === 0 ? amount * 2 : 0;
    case "high":    return n >= 19 && n <= 36 ? amount * 2 : 0;
    case "low":     return n >= 1  && n <= 18 ? amount * 2 : 0;
    case "dozen1":  return n >= 1  && n <= 12 ? amount * 3 : 0;
    case "dozen2":  return n >= 13 && n <= 24 ? amount * 3 : 0;
    case "dozen3":  return n >= 25 && n <= 36 ? amount * 3 : 0;
    case "col1":    return n !== 0 && n % 3 === 1 ? amount * 3 : 0;
    case "col2":    return n !== 0 && n % 3 === 2 ? amount * 3 : 0;
    case "col3":    return n !== 0 && n % 3 === 0 ? amount * 3 : 0;
    default:        return 0;
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
    // Stagger so multiple workers don't slam Redis at the same instant.
    setTimeout(() => this.tryAcquireLoop(), 2000 + Math.floor(Math.random() * 1000));
  }

  async onModuleDestroy() {
    if (this.lockRefreshTimer) clearInterval(this.lockRefreshTimer);
    if (this.hasLock) {
      // Release lock only if we still own it (compare-and-delete via Lua).
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
        // Another worker is running the loop. Check back later in case it dies.
        setTimeout(() => this.tryAcquireLoop(), LOOP_RETRY_MS);
        return;
      }
      this.hasLock = true;
      this.logger.log(`Acquired roulette loop lock (worker ${this.lockValue})`);
      // Keep refreshing so the TTL doesn't expire while we're alive.
      this.lockRefreshTimer = setInterval(async () => {
        // CAS refresh: only extend if we still own the lock.
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
      data: {
        status: RouletteRoundStatus.BETTING,
        serverSeed,
        serverSeedHash,
      },
    });

    await this.publishState(round.id, Date.now() + BETTING_MS);

    this.gateway.broadcast("roulette:newRound", {
      roundId: round.id,
      roundNumber: round.roundNumber,
      serverSeedHash: round.serverSeedHash,
      status: "BETTING",
      phaseEndsAt: this.phaseEndsAt,
    });

    setTimeout(() => this.startSpin(round.id), BETTING_MS);
  }

  async startSpin(roundId: string) {
    if (this.currentRoundId !== roundId) return;

    // Generate winning number from serverSeed (provably fair)
    const round = await this.prisma.rouletteRound.findUnique({ where: { id: roundId } });
    if (!round) return;

    const hash = crypto.createHash("sha256").update(round.serverSeed).digest("hex");
    const winningNumber = parseInt(hash.slice(0, 8), 16) % 37;
    const winningColor = getColor(winningNumber);

    await this.prisma.rouletteRound.update({
      where: { id: roundId },
      data: { status: RouletteRoundStatus.SPINNING, spinAt: new Date() },
    });

    await this.publishState(roundId, Date.now() + SPIN_MS);

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

    // Update round
    await this.prisma.rouletteRound.update({
      where: { id: roundId },
      data: {
        status: RouletteRoundStatus.SETTLED,
        winningNumber,
        winningColor,
        settledAt: new Date(),
      },
    });

    // Settle each bet — pay out winners via wallet ledger
    const settled = [];
    for (const bet of bets) {
      const amount = Number(bet.amount);
      const payout = calculatePayout(bet.betType as BetType, bet.betValue, amount, winningNumber);
      const isWin = payout > 0;

      await this.prisma.rouletteBet.update({
        where: { id: bet.id },
        data: { payout, isWin, settledAt: new Date() },
      });

      if (isWin) {
        try {
          await this.wallet.applyLedger({
            userId: bet.userId,
            amount: payout,
            kind: LedgerKind.CASINO_WIN,
            refType: "roulette_bet",
            refId: bet.id,
            note: `Roulette win #${winningNumber}`,
          });
        } catch (e) {
          this.logger.error(`Failed to pay winner ${bet.userId}: ${(e as Error).message}`);
        }
      }

      settled.push({
        betId: bet.id,
        userId: bet.userId,
        betType: bet.betType,
        betValue: bet.betValue,
        amount,
        payout,
        isWin,
      });
    }

    const round = await this.prisma.rouletteRound.findUnique({ where: { id: roundId } });

    await this.publishState(roundId, Date.now() + RESULT_MS);

    this.gateway.broadcast("roulette:result", {
      roundId,
      winningNumber,
      winningColor,
      serverSeed: round?.serverSeed, // reveal seed for verification
      bets: settled,
      phaseEndsAt: this.phaseEndsAt,
    });

    setTimeout(() => this.startNewRound(), RESULT_MS);
  }

  /**
   * Mirror the active-round pointer to Redis so EVERY cluster worker can serve
   * GET /current and accept bets — not only the worker that owns the game loop.
   * Without this, ~half of all HTTP requests hit a worker whose in-memory
   * currentRoundId is null, surfacing as a "stuck" wheel and "No active round"
   * bet failures until the user happens to refresh onto the loop-owner worker.
   */
  private async publishState(roundId: string, phaseEndsAt: number) {
    this.currentRoundId = roundId;
    this.phaseEndsAt = phaseEndsAt;
    try {
      await this.redis.client.set(STATE_KEY, JSON.stringify({ roundId, phaseEndsAt }), "EX", STATE_TTL_SECS);
    } catch (e) {
      this.logger.warn(`Failed to publish roulette state: ${(e as Error).message}`);
    }
  }

  /** Read the shared round pointer; fall back to this worker's own memory
   *  (set only on the loop owner) if Redis is briefly unavailable. */
  private async readState(): Promise<{ roundId: string; phaseEndsAt: number } | null> {
    try {
      const raw = await this.redis.client.get(STATE_KEY);
      if (raw) return JSON.parse(raw) as { roundId: string; phaseEndsAt: number };
    } catch { /* fall through to in-memory */ }
    if (this.currentRoundId) return { roundId: this.currentRoundId, phaseEndsAt: this.phaseEndsAt };
    return null;
  }

  async placeBet(userId: string, input: { betType: BetType; betValue?: string | null; amount: number }) {
    const state = await this.readState();
    if (!state) throw new BadRequestException("No active round");

    const round = await this.prisma.rouletteRound.findUnique({ where: { id: state.roundId } });
    if (!round) throw new BadRequestException("Round not found");
    if (round.status !== RouletteRoundStatus.BETTING) {
      throw new BadRequestException("Betting is closed for this round");
    }

    if (input.amount < 10) throw new BadRequestException("Minimum bet is 10");
    if (input.amount > 100000) throw new BadRequestException("Maximum bet is 100,000");

    if (input.betType === "number") {
      const n = Number(input.betValue);
      if (!Number.isInteger(n) || n < 0 || n > 36) {
        throw new BadRequestException("Number bet must be 0-36");
      }
    }

    const expectedLengths: Record<string, number> = { split: 2, street: 3, corner: 4, sixline: 6 };
    const expectedLen = expectedLengths[input.betType];
    if (expectedLen) {
      const nums = (input.betValue ?? "").split("/").map(Number);
      if (nums.length !== expectedLen || nums.some(n => isNaN(n) || n < 0 || n > 36)) {
        throw new BadRequestException(`Invalid betValue for ${input.betType}`);
      }
    }

    // Deduct bet from wallet
    await this.wallet.applyLedger({
      userId,
      amount: -input.amount,
      kind: LedgerKind.CASINO_BET,
      refType: "roulette_round",
      refId: round.id,
      note: `Roulette ${input.betType}${input.betValue ? ` ${input.betValue}` : ""}`,
    });

    // Create bet record
    const bet = await this.prisma.rouletteBet.create({
      data: {
        userId,
        roundId: round.id,
        betType: input.betType,
        betValue: input.betValue ?? null,
        amount: new Prisma.Decimal(input.amount),
      },
    });

    this.gateway.broadcast("roulette:betPlaced", {
      roundId: round.id,
      betId: bet.id,
      userId,
      betType: bet.betType,
      betValue: bet.betValue,
      amount: input.amount,
    });

    return { ok: true, betId: bet.id };
  }

  async getCurrentRound() {
    const state = await this.readState();
    if (!state) return null;

    const round = await this.prisma.rouletteRound.findUnique({
      where: { id: state.roundId },
      include: {
        bets: {
          select: { id: true, userId: true, betType: true, betValue: true, amount: true, payout: true, isWin: true },
        },
      },
    });

    if (!round) return null;

    return {
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      serverSeedHash: round.serverSeedHash,
      winningNumber: round.winningNumber,
      winningColor: round.winningColor,
      phaseEndsAt: state.phaseEndsAt,
      betsCount: round.bets.length,
    };
  }

  async getRecentResults(limit = 20) {
    const rounds = await this.prisma.rouletteRound.findMany({
      where: { status: RouletteRoundStatus.SETTLED },
      orderBy: { settledAt: "desc" },
      take: limit,
      select: {
        id: true,
        roundNumber: true,
        winningNumber: true,
        winningColor: true,
        settledAt: true,
      },
    });
    return rounds;
  }

  async getUserBets(userId: string, limit = 50) {
    return this.prisma.rouletteBet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        round: {
          select: { roundNumber: true, winningNumber: true, winningColor: true, status: true },
        },
      },
    });
  }
}
