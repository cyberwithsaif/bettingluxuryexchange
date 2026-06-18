import { Injectable, Logger, BadRequestException, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RedisService } from "../../common/redis/redis.service";
import { WalletService } from "../wallet/wallet.service";
import { EuropeanRouletteGateway } from "./european-roulette.gateway";
import { Prisma, LedgerKind, RouletteRoundStatus } from "@prisma/client";
import * as crypto from "crypto";

const LOOP_LOCK_KEY     = "lock:european-roulette:loop";
const LOOP_LOCK_TTL     = 30;
const LOOP_LOCK_REFRESH = 10_000;
const LOOP_RETRY        = 5_000;
const STATE_KEY         = "european-roulette:current";
const STATE_TTL         = 300;

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const BETTING_MS = 15_000;
const SPIN_MS    = 20_000;
const RESULT_MS  =  5_000;

export type EurBetType =
  | "number" | "red" | "black" | "odd" | "even" | "high" | "low"
  | "dozen1" | "dozen2" | "dozen3"
  | "col1"   | "col2"   | "col3"
  | "split"  | "street" | "corner" | "sixline";

export function getColor(n: number): "green" | "red" | "black" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

function parseNums(v: string | null): number[] {
  return (v ?? "").split("/").map(Number).filter(n => !isNaN(n));
}

function calculatePayout(t: EurBetType, v: string | null, a: number, n: number): number {
  const c = getColor(n);
  switch (t) {
    case "number":  return Number(v) === n            ? a * 36 : 0;
    case "split":   return parseNums(v).includes(n)   ? a * 18 : 0;
    case "street":  return parseNums(v).includes(n)   ? a * 12 : 0;
    case "corner":  return parseNums(v).includes(n)   ? a * 9  : 0;
    case "sixline": return parseNums(v).includes(n)   ? a * 6  : 0;
    case "red":     return c === "red"                ? a * 2  : 0;
    case "black":   return c === "black"              ? a * 2  : 0;
    case "odd":     return n !== 0 && n % 2 !== 0     ? a * 2  : 0;
    case "even":    return n !== 0 && n % 2 === 0     ? a * 2  : 0;
    case "high":    return n >= 19 && n <= 36         ? a * 2  : 0;
    case "low":     return n >= 1  && n <= 18         ? a * 2  : 0;
    case "dozen1":  return n >= 1  && n <= 12         ? a * 3  : 0;
    case "dozen2":  return n >= 13 && n <= 24         ? a * 3  : 0;
    case "dozen3":  return n >= 25 && n <= 36         ? a * 3  : 0;
    case "col1":    return n !== 0 && n % 3 === 1     ? a * 3  : 0;
    case "col2":    return n !== 0 && n % 3 === 2     ? a * 3  : 0;
    case "col3":    return n !== 0 && n % 3 === 0     ? a * 3  : 0;
    default:        return 0;
  }
}

@Injectable()
export class EuropeanRouletteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EuropeanRouletteService.name);
  private currentRoundId: string | null = null;
  private phaseEndsAt = 0;
  private readonly lockValue = `${process.env.NODE_APP_INSTANCE ?? "0"}:${process.pid}`;
  private lockRefreshTimer: NodeJS.Timeout | null = null;
  private hasLock = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wallet: WalletService,
    private readonly gateway: EuropeanRouletteGateway,
  ) {}

  async onModuleInit() {
    setTimeout(() => this.tryAcquireLoop(), 3000 + Math.floor(Math.random() * 1000));
  }
  async onModuleDestroy() {
    if (this.lockRefreshTimer) clearInterval(this.lockRefreshTimer);
    if (this.hasLock) {
      await this.redis.client.eval(
        `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
        1, LOOP_LOCK_KEY, this.lockValue,
      ).catch(() => {});
    }
  }

  private async tryAcquireLoop() {
    try {
      const ok = await this.redis.client.set(LOOP_LOCK_KEY, this.lockValue, "EX", LOOP_LOCK_TTL, "NX");
      if (ok !== "OK") { setTimeout(() => this.tryAcquireLoop(), LOOP_RETRY); return; }
      this.hasLock = true;
      this.logger.log(`Acquired European roulette loop lock (${this.lockValue})`);
      this.lockRefreshTimer = setInterval(async () => {
        const r = await this.redis.client.eval(
          `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("expire",KEYS[1],ARGV[2]) else return 0 end`,
          1, LOOP_LOCK_KEY, this.lockValue, LOOP_LOCK_TTL.toString(),
        ).catch(() => 0);
        if (r !== 1) {
          this.hasLock = false;
          if (this.lockRefreshTimer) { clearInterval(this.lockRefreshTimer); this.lockRefreshTimer = null; }
          setTimeout(() => this.tryAcquireLoop(), LOOP_RETRY);
        }
      }, LOOP_LOCK_REFRESH);
      await this.startNewRound();
    } catch (e) {
      this.logger.error(`tryAcquireLoop: ${(e as Error).message}`);
      setTimeout(() => this.tryAcquireLoop(), LOOP_RETRY);
    }
  }

  // ── Config (admin RTP / force number) ───────────────────────────────────
  private static readonly CFG_KEY = "european_roulette_config";

  async getConfig() {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: EuropeanRouletteService.CFG_KEY } });
    const v = (row?.value ?? {}) as Record<string, unknown>;
    const fn = v.forceNumber == null ? NaN : Number(v.forceNumber);
    return {
      rtpPercent:  Number(v.rtpPercent  ?? 97),
      minBet:      Number(v.minBet      ?? 10),
      maxBet:      Number(v.maxBet      ?? 100_000),
      maxPayout:   Number(v.maxPayout   ?? 0),
      enabled:     v.enabled !== false,
      forceNumber: Number.isInteger(fn) && fn >= 0 && fn <= 36 ? fn : null,
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
      patch.forceNumber = dto.forceNumber === null || !Number.isInteger(n) || n < 0 || n > 36 ? null : n;
    }
    const cur = ((await this.prisma.systemConfig.findUnique({ where: { key: EuropeanRouletteService.CFG_KEY } }))?.value as Record<string, unknown>) ?? {};
    const merged = { ...cur, ...patch };
    await this.prisma.systemConfig.upsert({
      where:  { key: EuropeanRouletteService.CFG_KEY },
      create: { key: EuropeanRouletteService.CFG_KEY, value: merged as Prisma.InputJsonValue },
      update: { value: merged as Prisma.InputJsonValue },
    });
    return this.getConfig();
  }

  private async clearForceNumber() {
    const cur = ((await this.prisma.systemConfig.findUnique({ where: { key: EuropeanRouletteService.CFG_KEY } }))?.value as Record<string, unknown>) ?? {};
    if (cur.forceNumber == null) return;
    await this.prisma.systemConfig.update({
      where: { key: EuropeanRouletteService.CFG_KEY },
      data:  { value: { ...cur, forceNumber: null } as Prisma.InputJsonValue },
    });
  }

  private async chooseWinningNumber(
    seed: string,
    bets: { betType: string; betValue: string | null; amount: Prisma.Decimal }[],
    cfg: { rtpPercent: number; forceNumber: number | null },
  ): Promise<number> {
    if (cfg.forceNumber !== null) {
      await this.clearForceNumber();
      this.logger.log(`EU Roulette forced number ${cfg.forceNumber}`);
      return cfg.forceNumber;
    }
    const hash  = crypto.createHash("sha256").update(seed).digest("hex");
    const baseN = parseInt(hash.slice(0, 8), 16) % 37;
    if (!bets.length || cfg.rtpPercent === 100) return baseN;

    const payouts = Array.from({ length: 37 }, (_, n) =>
      bets.reduce((s, b) => s + calculatePayout(b.betType as EurBetType, b.betValue, Number(b.amount), n), 0),
    );
    const ranked = Array.from({ length: 37 }, (_, n) => n).sort((a, b) => payouts[a]! - payouts[b]!);
    const steer  = (100 - cfg.rtpPercent) / 100;
    const k      = Math.min(0.96, Math.abs(steer) * 3);
    let u        = parseInt(hash.slice(8, 16), 16) / 0x100000000;
    if      (steer > 0) u = Math.pow(u, 1 + k * 10);
    else if (steer < 0) u = 1 - Math.pow(1 - u, 1 + k * 10);
    return ranked[Math.min(36, Math.floor(u * 37))]!;
  }

  // ── Game loop ────────────────────────────────────────────────────────────
  async startNewRound() {
    try {
      const seed = crypto.randomBytes(32).toString("hex");
      const hash = crypto.createHash("sha256").update(seed).digest("hex");
      const round = await this.prisma.europeanRouletteRound.create({
        data: { status: RouletteRoundStatus.BETTING, serverSeed: seed, serverSeedHash: hash },
      });
      await this.publishState(round.id, Date.now() + BETTING_MS, "BETTING");
      this.gateway.broadcast("european-roulette:newRound", {
        roundId: round.id, roundNumber: round.roundNumber,
        serverSeedHash: hash, status: "BETTING", phaseEndsAt: this.phaseEndsAt,
      });
      setTimeout(() => this.startSpin(round.id), BETTING_MS);
    } catch (e) {
      this.logger.error(`startNewRound: ${(e as Error).message}`);
      setTimeout(() => this.startNewRound(), LOOP_RETRY);
    }
  }

  async startSpin(roundId: string) {
    if (this.currentRoundId !== roundId) return;
    const round = await this.prisma.europeanRouletteRound.findUnique({ where: { id: roundId } });
    if (!round) return;
    const cfg  = await this.getConfig();
    const bets = await this.prisma.europeanRouletteBet.findMany({ where: { roundId }, select: { betType: true, betValue: true, amount: true } });
    const winningNumber = await this.chooseWinningNumber(round.serverSeed, bets, cfg);
    const winningColor  = getColor(winningNumber);
    await this.prisma.europeanRouletteRound.update({
      where: { id: roundId },
      data:  { status: RouletteRoundStatus.SPINNING, spinAt: new Date() },
    });
    await this.publishState(roundId, Date.now() + SPIN_MS, "SPINNING");
    this.gateway.broadcast("european-roulette:spin", { roundId, winningNumber, winningColor, phaseEndsAt: this.phaseEndsAt });
    setTimeout(() => this.settleRound(roundId, winningNumber, winningColor), SPIN_MS);
  }

  async settleRound(roundId: string, winningNumber: number, winningColor: string) {
    const bets = await this.prisma.europeanRouletteBet.findMany({ where: { roundId } });
    const { maxPayout } = await this.getConfig();
    await this.prisma.europeanRouletteRound.update({
      where: { id: roundId },
      data:  { status: RouletteRoundStatus.SETTLED, winningNumber, winningColor, settledAt: new Date() },
    });
    const settled = [];
    for (const bet of bets) {
      const amount = Number(bet.amount);
      let payout   = calculatePayout(bet.betType as EurBetType, bet.betValue, amount, winningNumber);
      if (maxPayout > 0 && payout > maxPayout) payout = maxPayout;
      const isWin  = payout > 0;
      await this.prisma.europeanRouletteBet.update({ where: { id: bet.id }, data: { payout, isWin, settledAt: new Date() } });
      if (isWin) {
        try {
          await this.wallet.applyLedger({
            userId: bet.userId, amount: payout, kind: LedgerKind.CASINO_WIN,
            refType: "european_roulette_bet", refId: bet.id,
            note: `European Roulette win #${winningNumber}`,
          });
        } catch (e) { this.logger.error(`Pay winner ${bet.userId}: ${(e as Error).message}`); }
      }
      settled.push({ betId: bet.id, userId: bet.userId, betType: bet.betType, betValue: bet.betValue, amount, payout, isWin });
    }
    const round = await this.prisma.europeanRouletteRound.findUnique({ where: { id: roundId } });
    await this.publishState(roundId, Date.now() + RESULT_MS, "SETTLED");
    this.gateway.broadcast("european-roulette:result", { roundId, winningNumber, winningColor, serverSeed: round?.serverSeed, bets: settled, phaseEndsAt: this.phaseEndsAt });
    setTimeout(() => this.startNewRound(), RESULT_MS);
  }

  private async publishState(roundId: string, phaseEndsAt: number, phase: string) {
    this.currentRoundId = roundId;
    this.phaseEndsAt    = phaseEndsAt;
    try { await this.redis.client.set(STATE_KEY, JSON.stringify({ roundId, phaseEndsAt, phase }), "EX", STATE_TTL); } catch { /* ignore */ }
  }

  private async readState(): Promise<{ roundId: string; phaseEndsAt: number; phase?: string } | null> {
    try { const raw = await this.redis.client.get(STATE_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
    if (this.currentRoundId) return { roundId: this.currentRoundId, phaseEndsAt: this.phaseEndsAt };
    return null;
  }

  // ── Public API ───────────────────────────────────────────────────────────
  async placeBet(userId: string, input: { betType: EurBetType; betValue?: string | null; amount: number }) {
    const state = await this.readState();
    if (!state) throw new BadRequestException("No active round");
    const round = await this.prisma.europeanRouletteRound.findUnique({ where: { id: state.roundId } });
    if (!round) throw new BadRequestException("Round not found");
    if (round.status !== RouletteRoundStatus.BETTING) throw new BadRequestException("Betting is closed");
    const cfg = await this.getConfig();
    if (!cfg.enabled) throw new BadRequestException("European Roulette is disabled");
    if (input.amount < cfg.minBet) throw new BadRequestException(`Min bet ₹${cfg.minBet}`);
    if (input.amount > cfg.maxBet) throw new BadRequestException(`Max bet ₹${cfg.maxBet}`);
    if (input.betType === "number") {
      const n = Number(input.betValue);
      if (!Number.isInteger(n) || n < 0 || n > 36) throw new BadRequestException("Number must be 0-36");
    }
    const expectedLengths: Record<string, number> = { split: 2, street: 3, corner: 4, sixline: 6 };
    const expectedLen = expectedLengths[input.betType];
    if (expectedLen) {
      const nums = (input.betValue ?? "").split("/").map(Number);
      if (nums.length !== expectedLen || nums.some(n => isNaN(n) || n < 0 || n > 36)) throw new BadRequestException(`Invalid betValue for ${input.betType}`);
    }
    await this.wallet.applyLedger({ userId, amount: -input.amount, kind: LedgerKind.CASINO_BET, refType: "european_roulette_round", refId: round.id, note: `EU Roulette ${input.betType}` });
    const bet = await this.prisma.europeanRouletteBet.create({
      data: { userId, roundId: round.id, betType: input.betType, betValue: input.betValue ?? null, amount: new Prisma.Decimal(input.amount) },
    });
    this.gateway.broadcast("european-roulette:betPlaced", { roundId: round.id, betId: bet.id, userId, betType: bet.betType, amount: input.amount });
    return { ok: true, betId: bet.id };
  }

  async getCurrentRound() {
    const state = await this.readState();
    if (!state) return null;
    const round = await this.prisma.europeanRouletteRound.findUnique({
      where:   { id: state.roundId },
      include: { bets: { select: { id: true, userId: true, betType: true, betValue: true, amount: true, payout: true, isWin: true } } },
    });
    if (!round) return null;
    return {
      id: round.id, roundNumber: round.roundNumber, status: round.status,
      phase: (state as any).phase ?? round.status, serverSeedHash: round.serverSeedHash,
      winningNumber: round.winningNumber, winningColor: round.winningColor,
      phaseEndsAt: state.phaseEndsAt, betsCount: round.bets.length,
      totalWagered: round.bets.reduce((s, b) => s + Number(b.amount), 0),
    };
  }

  async getRecentResults(limit = 20) {
    return this.prisma.europeanRouletteRound.findMany({
      where: { status: RouletteRoundStatus.SETTLED }, orderBy: { settledAt: "desc" }, take: limit,
      select: { id: true, roundNumber: true, winningNumber: true, winningColor: true, settledAt: true },
    });
  }

  async getUserBets(userId: string, limit = 50) {
    return this.prisma.europeanRouletteBet.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, take: limit,
      include: { round: { select: { roundNumber: true, winningNumber: true, winningColor: true, status: true } } },
    });
  }
}
