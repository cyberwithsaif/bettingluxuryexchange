import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { PumpGateway } from "./pump.gateway";
import { Prisma, LedgerKind, PumpStatus, PumpDifficulty } from "@prisma/client";
import * as crypto from "crypto";

// ── Difficulty configs ──────────────────────────────────────────
// popChance per pump (constant per difficulty)
// houseEdge controls overall RTP per pump

export interface DifficultyParams {
  popChance: number;   // 0..1
  maxPumps: number;    // hard cap on pump count (safety, prevents infinite mult)
}

const DIFFICULTY_DEFAULTS: Record<PumpDifficulty, DifficultyParams> = {
  EASY:   { popChance: 0.04, maxPumps: 25 },
  MEDIUM: { popChance: 0.10, maxPumps: 25 },
  HARD:   { popChance: 0.20, maxPumps: 15 },
  EXPERT: { popChance: 0.33, maxPumps: 12 },
  INSANE: { popChance: 0.50, maxPumps: 10 },
};

export interface PumpConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  maxPayout: number;
  rtpPercent: number;          // 80..99 — multiplies every multiplier
  difficulties: Record<PumpDifficulty, DifficultyParams>;
  // Win-control overrides:
  // forceWinUserId — if set, the next bet from that user is forced to a specific outcome
  forceWinUserId: string | null;
  forceWinPumps: number | null;   // pop after exactly this many pumps (player wins if cashes before)
  // forceLossUserId — next bet from that user pops on pump 1 (instant loss)
  forceLossUserId: string | null;
  // forceNextWinPumps — global: pop pump for next session
  forceNextPopPump: number | null;
}

const DEFAULT_CONFIG: PumpConfig = {
  enabled: true,
  minBet: 10,
  maxBet: 100_000,
  maxPayout: 5_000_000,
  rtpPercent: 97,
  difficulties: DIFFICULTY_DEFAULTS,
  forceWinUserId: null,
  forceWinPumps: null,
  forceLossUserId: null,
  forceNextPopPump: null,
};

@Injectable()
export class PumpService {
  private readonly logger = new Logger(PumpService.name);
  private config: PumpConfig = { ...DEFAULT_CONFIG };

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly gateway: PumpGateway,
  ) {}

  // ── Multiplier table ────────────────────────────────────────
  // M(n) = (rtp/100) / (1 - popChance)^n
  // The next pump (pump n+1) is shown to the player as the "next multiplier"
  // pump n=0 → 1.00 (no pumps yet). Cashout payout is at currentMult.

  private buildMultTable(difficulty: PumpDifficulty, rtpPercent: number, cfg?: DifficultyParams): number[] {
    const p = cfg ?? this.config.difficulties[difficulty] ?? DIFFICULTY_DEFAULTS[difficulty];
    const table: number[] = [];
    for (let n = 1; n <= p.maxPumps; n++) {
      const m = (rtpPercent / 100) / Math.pow(1 - p.popChance, n);
      table.push(Math.max(1.00, Math.round(m * 100) / 100));
    }
    return table;
  }

  // ── Provably fair pop-pump derivation ───────────────────────
  // Use HMAC(serverSeed, "pump:popPump:v1:<clientSeed>:<nonce>") → uniform u in [0,1)
  // Then popPump = floor(log(1 - u) / log(1 - p)) + 1   (geometric distribution)

  private derivePopPump(
    serverSeed: string,
    clientSeed: string,
    nonce: number,
    difficulty: PumpDifficulty,
  ): number {
    const params = this.config.difficulties[difficulty] ?? DIFFICULTY_DEFAULTS[difficulty];
    const msg = `pump:popPump:v1:${clientSeed}:${nonce}:${difficulty}`;
    const hash = crypto.createHmac("sha256", serverSeed).update(msg).digest("hex");
    const u = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
    // Avoid log(0)
    const safeU = Math.min(0.999999, Math.max(0.000001, u));
    const pop = Math.floor(Math.log(1 - safeU) / Math.log(1 - params.popChance)) + 1;
    return Math.min(Math.max(1, pop), params.maxPumps);
  }

  // ── Place bet (start session) ───────────────────────────────

  async placeBet(userId: string, input: {
    betAmount: number;
    difficulty: PumpDifficulty;
    clientSeed?: string;
  }) {
    const cfg = await this.loadConfig();
    if (!cfg.enabled) throw new BadRequestException("Pump game is currently disabled");

    if (input.betAmount < cfg.minBet) throw new BadRequestException(`Minimum bet is ₹${cfg.minBet}`);
    if (input.betAmount > cfg.maxBet) throw new BadRequestException(`Maximum bet is ₹${cfg.maxBet}`);

    // One active session per user at a time
    const existing = await this.prisma.pumpBet.findFirst({
      where: { userId, status: PumpStatus.ACTIVE },
    });
    if (existing) throw new BadRequestException("You already have an active Pump session — finish it first");

    const serverSeed     = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const clientSeed     = (input.clientSeed ?? "").slice(0, 64);
    const nonce          = Math.floor(Math.random() * 1_000_000);

    // Determine pop pump
    let popPump = this.derivePopPump(serverSeed, clientSeed, nonce, input.difficulty);

    // Apply admin overrides
    if (cfg.forceLossUserId && cfg.forceLossUserId === userId) {
      popPump = 1; // instant pop on first pump
      await this.saveConfig({ forceLossUserId: null });
    } else if (cfg.forceWinUserId && cfg.forceWinUserId === userId && cfg.forceWinPumps != null) {
      popPump = Math.max(1, cfg.forceWinPumps);
      await this.saveConfig({ forceWinUserId: null, forceWinPumps: null });
    } else if (cfg.forceNextPopPump != null) {
      popPump = Math.max(1, cfg.forceNextPopPump);
      await this.saveConfig({ forceNextPopPump: null });
    }

    // Debit bet
    await this.wallet.applyLedger({
      userId,
      amount:  -input.betAmount,
      kind:    LedgerKind.CASINO_BET,
      refType: "pump",
      refId:   `pump-bet-${Date.now()}-${userId.slice(0, 6)}`,
      note:    `Pump bet (${input.difficulty})`,
    });

    const bet = await this.prisma.pumpBet.create({
      data: {
        userId,
        betAmount:      new Prisma.Decimal(input.betAmount),
        difficulty:     input.difficulty,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        popPump,
        pumpsCount:     0,
        currentMult:    new Prisma.Decimal(1.00),
        status:         PumpStatus.ACTIVE,
      },
      include: { user: { select: { username: true } } },
    });

    const multTable = this.buildMultTable(input.difficulty, cfg.rtpPercent);

    // Live feed: announce new session
    this.gateway.broadcast("pump:session", {
      betId:     bet.id,
      username:  bet.user.username,
      betAmount: input.betAmount,
      difficulty: input.difficulty,
    });

    return {
      betId: bet.id,
      difficulty: bet.difficulty,
      serverSeedHash: bet.serverSeedHash,
      clientSeed: bet.clientSeed,
      nonce: bet.nonce,
      pumpsCount: 0,
      currentMult: 1.00,
      maxPumps: this.config.difficulties[input.difficulty].maxPumps,
      multTable,
      status: PumpStatus.ACTIVE,
    };
  }

  // ── Pump (inflate balloon by one step) ──────────────────────

  async pump(userId: string, betId: string) {
    const cfg = await this.loadConfig();

    const bet = await this.prisma.pumpBet.findUnique({ where: { id: betId } });
    if (!bet) throw new BadRequestException("Bet not found");
    if (bet.userId !== userId) throw new BadRequestException("Not your bet");
    if (bet.status !== PumpStatus.ACTIVE) throw new BadRequestException("Session already finished");

    const newPumps = bet.pumpsCount + 1;
    const diffParams = cfg.difficulties[bet.difficulty] ?? DIFFICULTY_DEFAULTS[bet.difficulty];

    if (newPumps > diffParams.maxPumps) {
      throw new BadRequestException("Max pumps reached — please cash out");
    }

    // POP check
    if (newPumps >= bet.popPump) {
      // balloon pops on this pump → loss
      await this.prisma.pumpBet.update({
        where: { id: betId },
        data: {
          pumpsCount: newPumps,
          status:     PumpStatus.POPPED,
          isWin:      false,
          payout:     new Prisma.Decimal(0),
          settledAt:  new Date(),
        },
      });

      this.gateway.broadcast("pump:popped", {
        betId,
        userId,
        difficulty: bet.difficulty,
        betAmount:  Number(bet.betAmount),
        pumpsCount: newPumps,
      });

      return {
        popped:        true,
        pumpsCount:    newPumps,
        popPump:       bet.popPump,
        finalMult:     0,
        serverSeed:    bet.serverSeed,
        serverSeedHash: bet.serverSeedHash,
        status:        PumpStatus.POPPED,
      };
    }

    // Survives → multiplier increases
    const newMult = (cfg.rtpPercent / 100) / Math.pow(1 - diffParams.popChance, newPumps);
    const newMultRounded = Math.round(newMult * 100) / 100;

    await this.prisma.pumpBet.update({
      where: { id: betId },
      data: {
        pumpsCount:  newPumps,
        currentMult: new Prisma.Decimal(newMultRounded),
      },
    });

    return {
      popped:        false,
      pumpsCount:    newPumps,
      currentMult:   newMultRounded,
      maxPumps:      diffParams.maxPumps,
      status:        PumpStatus.ACTIVE,
    };
  }

  // ── Cashout ────────────────────────────────────────────────

  async cashout(userId: string, betId: string) {
    const cfg = await this.loadConfig();
    const bet = await this.prisma.pumpBet.findUnique({ where: { id: betId } });
    if (!bet) throw new BadRequestException("Bet not found");
    if (bet.userId !== userId) throw new BadRequestException("Not your bet");
    if (bet.status !== PumpStatus.ACTIVE) throw new BadRequestException("Session already finished");
    if (bet.pumpsCount === 0) throw new BadRequestException("Pump at least once before cashing out");

    const betAmt    = Number(bet.betAmount);
    const mult      = Number(bet.currentMult);
    const grossWin  = Math.round(betAmt * mult * 100) / 100;
    const payout    = Math.min(grossWin, cfg.maxPayout);

    await this.prisma.pumpBet.update({
      where: { id: betId },
      data: {
        status:    PumpStatus.CASHED,
        isWin:     true,
        payout:    new Prisma.Decimal(payout),
        settledAt: new Date(),
      },
    });

    await this.wallet.applyLedger({
      userId,
      amount:  payout,
      kind:    LedgerKind.CASINO_WIN,
      refType: "pump",
      refId:   betId,
      note:    `Pump cashout ×${mult.toFixed(2)} (${bet.difficulty})`,
    });

    this.gateway.broadcast("pump:cashed", {
      betId,
      userId,
      difficulty: bet.difficulty,
      betAmount:  betAmt,
      multiplier: mult,
      payout,
      pumpsCount: bet.pumpsCount,
    });

    return {
      betId,
      multiplier:    mult,
      payout,
      pumpsCount:    bet.pumpsCount,
      serverSeed:    bet.serverSeed,
      serverSeedHash: bet.serverSeedHash,
      status:        PumpStatus.CASHED,
    };
  }

  // ── Queries ──────────────────────────────────────────────────

  async getActiveSession(userId: string) {
    const bet = await this.prisma.pumpBet.findFirst({
      where: { userId, status: PumpStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
    });
    if (!bet) return null;
    const cfg = await this.loadConfig();
    const params = cfg.difficulties[bet.difficulty] ?? DIFFICULTY_DEFAULTS[bet.difficulty];
    return {
      betId:          bet.id,
      betAmount:      Number(bet.betAmount),
      difficulty:     bet.difficulty,
      pumpsCount:     bet.pumpsCount,
      currentMult:    Number(bet.currentMult),
      serverSeedHash: bet.serverSeedHash,
      clientSeed:     bet.clientSeed,
      nonce:          bet.nonce,
      maxPumps:       params.maxPumps,
      multTable:      this.buildMultTable(bet.difficulty, cfg.rtpPercent),
      status:         bet.status,
    };
  }

  async getMultTableForDifficulty(difficulty: PumpDifficulty) {
    const cfg = await this.loadConfig();
    const params = cfg.difficulties[difficulty] ?? DIFFICULTY_DEFAULTS[difficulty];
    return {
      difficulty,
      popChance: params.popChance,
      maxPumps:  params.maxPumps,
      table:     this.buildMultTable(difficulty, cfg.rtpPercent),
    };
  }

  async verifySession(betId: string) {
    const bet = await this.prisma.pumpBet.findUnique({ where: { id: betId } });
    if (!bet) throw new BadRequestException("Bet not found");
    if (bet.status === PumpStatus.ACTIVE) throw new BadRequestException("Session still active");

    const params = this.config.difficulties[bet.difficulty] ?? DIFFICULTY_DEFAULTS[bet.difficulty];
    const msg  = `pump:popPump:v1:${bet.clientSeed}:${bet.nonce}:${bet.difficulty}`;
    const hash = crypto.createHmac("sha256", bet.serverSeed).update(msg).digest("hex");
    const u    = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
    const safeU = Math.min(0.999999, Math.max(0.000001, u));
    const computedPop = Math.min(Math.max(1, Math.floor(Math.log(1 - safeU) / Math.log(1 - params.popChance)) + 1), params.maxPumps);
    const seedHashOk = crypto.createHash("sha256").update(bet.serverSeed).digest("hex") === bet.serverSeedHash;

    return {
      betId:           bet.id,
      difficulty:      bet.difficulty,
      serverSeed:      bet.serverSeed,
      serverSeedHash:  bet.serverSeedHash,
      clientSeed:      bet.clientSeed,
      nonce:           bet.nonce,
      recordedPopPump: bet.popPump,
      computedPopPump: computedPop,
      seedHashMatches: seedHashOk,
      popMatches:      computedPop === bet.popPump,
    };
  }

  async getUserBets(userId: string, limit = 50) {
    const bets = await this.prisma.pumpBet.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      take:    Math.min(limit, 200),
    });
    return bets.map(b => ({
      id:           b.id,
      betAmount:    Number(b.betAmount),
      difficulty:   b.difficulty,
      pumpsCount:   b.pumpsCount,
      currentMult:  Number(b.currentMult),
      payout:       Number(b.payout),
      isWin:        b.isWin,
      status:       b.status,
      createdAt:    b.createdAt,
      settledAt:    b.settledAt,
    }));
  }

  async getRecentSettled(limit = 30) {
    const bets = await this.prisma.pumpBet.findMany({
      where:   { status: { in: [PumpStatus.CASHED, PumpStatus.POPPED] } },
      orderBy: { settledAt: "desc" },
      take:    Math.min(limit, 50),
      include: { user: { select: { username: true } } },
    });
    return bets.map(b => ({
      id:          b.id,
      username:    b.user.username,
      betAmount:   Number(b.betAmount),
      difficulty:  b.difficulty,
      multiplier:  Number(b.currentMult),
      payout:      Number(b.payout),
      isWin:       b.isWin,
      status:      b.status,
      pumpsCount:  b.pumpsCount,
      settledAt:   b.settledAt,
    }));
  }

  // ── Config ───────────────────────────────────────────────────

  async loadConfig(): Promise<PumpConfig> {
    try {
      const row = await this.prisma.systemConfig.findUnique({ where: { key: "pump_config" } });
      if (row) {
        const merged = { ...DEFAULT_CONFIG, ...(row.value as any) };
        // Ensure all difficulty entries exist (in case schema changed)
        merged.difficulties = { ...DIFFICULTY_DEFAULTS, ...(merged.difficulties ?? {}) };
        this.config = merged;
      }
    } catch { /* defaults */ }
    return this.config;
  }

  async getConfig(): Promise<PumpConfig> {
    return this.loadConfig();
  }

  async saveConfig(patch: Partial<PumpConfig>) {
    await this.loadConfig();
    const next: PumpConfig = {
      ...this.config,
      ...patch,
      difficulties: patch.difficulties
        ? { ...this.config.difficulties, ...patch.difficulties }
        : this.config.difficulties,
    };
    await this.prisma.systemConfig.upsert({
      where:  { key: "pump_config" },
      create: { key: "pump_config", value: next as any },
      update: { value: next as any },
    });
    this.config = next;
    return next;
  }

  // ── Admin stats ─────────────────────────────────────────────

  async getAdminStats() {
    const [totalSessions, totalCashed, totalPopped, agg, bigWins] = await Promise.all([
      this.prisma.pumpBet.count(),
      this.prisma.pumpBet.count({ where: { status: PumpStatus.CASHED } }),
      this.prisma.pumpBet.count({ where: { status: PumpStatus.POPPED } }),
      this.prisma.pumpBet.aggregate({
        _sum: { betAmount: true, payout: true },
        _avg: { betAmount: true, currentMult: true },
      }),
      this.prisma.pumpBet.findMany({
        where:   { isWin: true },
        orderBy: { payout: "desc" },
        take:    10,
        include: { user: { select: { username: true } } },
      }),
    ]);

    const hourAgo = new Date(Date.now() - 3_600_000);
    const activePlayers = await this.prisma.pumpBet.groupBy({
      by:    ["userId"],
      where: { createdAt: { gte: hourAgo } },
    });

    const totalWagered = Number(agg._sum.betAmount ?? 0);
    const totalPaid    = Number(agg._sum.payout ?? 0);

    return {
      totalSessions,
      totalCashed,
      totalPopped,
      totalWagered,
      totalPaid,
      houseProfit:  totalWagered - totalPaid,
      actualRTP:    totalWagered > 0 ? Math.round((totalPaid / totalWagered) * 10000) / 100 : 0,
      avgBet:       Math.round(Number(agg._avg.betAmount ?? 0) * 100) / 100,
      avgCashoutX:  Math.round(Number(agg._avg.currentMult ?? 0) * 100) / 100,
      activePlayers: activePlayers.length,
      bigWins: bigWins.map(b => ({
        id:         b.id,
        username:   b.user.username,
        betAmount:  Number(b.betAmount),
        multiplier: Number(b.currentMult),
        difficulty: b.difficulty,
        payout:     Number(b.payout),
        createdAt:  b.createdAt,
      })),
    };
  }

  async findUserByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true },
    });
  }
}
