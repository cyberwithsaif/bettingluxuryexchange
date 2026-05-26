import { Injectable, Logger, BadRequestException, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { PlinkoGateway } from "./plinko.gateway";
import { AdminService } from "../admin/admin.service";
import { LedgerKind, Prisma } from "@prisma/client";
import * as crypto from "crypto";

// ── Multiplier tables ──────────────────────────────────────────────────────
// rows+1 slots per row count. Symmetric around center. These values are FIXED
// and shown to the player. The admin RTP biases which slot the ball lands in
// (not the payout values), so the visible multipliers never change.
const MULTIPLIERS: Record<number, Record<string, number[]>> = {
  8: {
    low:    [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    medium: [13,  3,   1.3, 0.7, 0.4, 0.7, 1.3, 3,   13],
    high:   [29,  4,   1.5, 0.3, 0.2, 0.3, 1.5, 4,   29],
  },
  12: {
    low:    [10, 3,  1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3,  10],
    medium: [33, 11, 4,   2,   1.1, 0.6, 0.3, 0.6, 1.1, 2,   4,   11, 33],
    high:   [141,26, 9,   2,   0.9, 0.3, 0.2, 0.3, 0.9, 2,   9,   26, 141],
  },
  16: {
    low:    [16,  9,  2,  1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2,  9,  16],
    medium: [110, 41, 10, 5,   3,   1.5, 1,   0.5, 0.3, 0.5, 1,   1.5, 3,   5,   10, 41, 110],
    high:   [1000,130,26, 9,   4,   2,   0.2, 0.2, 0.2, 0.2, 0.2, 2,   4,   9,   26, 130,1000],
  },
  24: {
    low:    [50, 20, 10, 5, 3, 1.5, 1.3, 1.2, 1.1, 1.0, 0.8, 0.5, 0.3, 0.5, 0.8, 1.0, 1.1, 1.2, 1.3, 1.5, 3, 5, 10, 20, 50],
    medium: [500,150,50, 20,10, 5,   3,   1.5, 1,   0.5, 0.3, 0.2, 0.2, 0.2, 0.3, 0.5, 1,   1.5, 3,   5,  10,20, 50,150,500],
    high:   [10000,500,100,50,20,5,  1,   0.5, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.5, 1,   5,  20,50,100,500,10000],
  },
};

const VALID_ROWS = [8, 12, 16, 24];
const VALID_RISK = ["low", "medium", "high"] as const;
type RiskLevel = (typeof VALID_RISK)[number];

interface PlinkoConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  maxPayout: number;
  rtpPercent: number;  // target RTP — biases slot odds (1–200), payouts stay fixed
}

const DEFAULT_CONFIG: PlinkoConfig = {
  enabled: true,
  minBet: 10,
  maxBet: 100000,
  maxPayout: 5000000,
  rtpPercent: 97,
};

@Injectable()
export class PlinkoService implements OnModuleInit {
  private readonly logger = new Logger(PlinkoService.name);
  private config: PlinkoConfig = { ...DEFAULT_CONFIG };

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly gateway: PlinkoGateway,
    private readonly admin: AdminService,
  ) {}

  async onModuleInit() {
    await this.loadConfig();
  }

  // ── Config ────────────────────────────────────────────────────────────────

  async loadConfig() {
    try {
      const row = await this.prisma.systemConfig.findUnique({ where: { key: "plinko_config" } });
      if (row) this.config = { ...DEFAULT_CONFIG, ...(row.value as any) };
    } catch { /* use defaults */ }
  }

  async getConfig(): Promise<PlinkoConfig> {
    await this.loadConfig();
    return this.config;
  }

  async saveConfig(patch: Partial<PlinkoConfig>) {
    const next = { ...this.config, ...patch };
    await this.prisma.systemConfig.upsert({
      where: { key: "plinko_config" },
      create: { key: "plinko_config", value: next as any },
      update: { value: next as any },
    });
    this.config = next;
    return next;
  }

  // ── Outcome engine (fixed payouts, RTP biases slot odds) ──────────────────

  private hmac(serverSeed: string, clientSeed: string, nonce: number): Buffer {
    return crypto.createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}`).digest();
  }

  /** Fixed multiplier table — NEVER scaled. The admin RTP biases WHERE the ball
   *  lands, not the payout values, so the visible bottom-row never changes. */
  getMultiplierTable(rows: number, risk: string): number[] {
    return MULTIPLIERS[rows]?.[risk] ?? [];
  }
  private rawMultiplier(rows: number, risk: RiskLevel, slot: number): number {
    return MULTIPLIERS[rows]?.[risk]?.[slot] ?? 0;
  }

  /** Natural binomial slot probabilities (a fair drop), normalized. */
  private slotWeights(rows: number): number[] {
    const w: number[] = [];
    let c = 1;
    for (let k = 0; k <= rows; k++) { w.push(c); c = (c * (rows - k)) / (k + 1); }
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map(x => x / sum);
  }
  private ev(P: number[], M: number[]): number {
    let e = 0; for (let s = 0; s < M.length; s++) e += P[s] * (M[s] ?? 0); return e;
  }

  /**
   * Slot probability distribution that yields target RTP `T` (a fraction) while
   * keeping the multiplier table fixed — purely by biasing the landing slot:
   *  T < fair  → more weight on losing center slots (house profit)
   *  T > fair  → more weight on winning / jackpot edge slots (players win)
   */
  private targetDistribution(rows: number, risk: RiskLevel, T: number): number[] {
    const M = MULTIPLIERS[rows]?.[risk] ?? [];
    const N = this.slotWeights(rows);
    const idxOf = (pred: (m: number) => boolean) => M.map((m, i) => (pred(m) ? i : -1)).filter(i => i >= 0);
    const restrict = (idx: number[]) => {
      const P = new Array(M.length).fill(0);
      const sum = idx.reduce((a, i) => a + N[i], 0) || 1;
      idx.forEach(i => { P[i] = N[i] / sum; });
      return P;
    };
    const maxM = Math.max(...M);
    const L = restrict(idxOf(m => m < 1));      // losing cluster
    const H = restrict(idxOf(m => m >= 1));     // winning cluster
    const E = restrict(idxOf(m => m === maxM)); // jackpot edges
    const evN = this.ev(N, M), evL = this.ev(L, M), evH = this.ev(H, M), evE = maxM;
    const t = Math.min(evE - 1e-6, Math.max(evL + 1e-6, T));
    const mix = (A: number[], B: number[], f: number) => A.map((p, i) => p * (1 - f) + B[i] * f);
    if (t <= evN) return mix(N, L, (evN - t) / Math.max(1e-9, evN - evL));
    if (t <= evH) return mix(N, H, (t - evN) / Math.max(1e-9, evH - evN));
    return mix(H, E, (t - evH) / Math.max(1e-9, evE - evH));
  }

  /** Deterministic biased outcome from the seed + RTP. */
  private computeOutcome(serverSeed: string, clientSeed: string, nonce: number, rows: number, risk: RiskLevel, rtpPercent: number): { path: number[]; slot: number } {
    const h = this.hmac(serverSeed, clientSeed, nonce);
    let u = 0; for (let i = 0; i < 6; i++) u = u * 256 + h[i]; u /= 2 ** 48; // uniform [0,1)
    const P = this.targetDistribution(rows, risk, rtpPercent / 100);
    let acc = 0, slot = P.length - 1;
    for (let s = 0; s < P.length; s++) { acc += P[s]; if (u < acc) { slot = s; break; } }
    // Arrange `slot` right-moves across `rows` pegs, shuffled deterministically (visual only).
    const order = Array.from({ length: rows }, (_, i) => i);
    let bi = 8;
    const rnd = () => { const b = h[bi % 32]; bi++; return b / 256; };
    for (let i = rows - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const path = new Array(rows).fill(0);
    for (let k = 0; k < slot; k++) path[order[k]] = 1;
    return { path, slot };
  }

  // ── Core Bet Logic ────────────────────────────────────────────────────────

  async placeBet(userId: string, input: {
    betAmount: number;
    rows: number;
    riskLevel: string;
    clientSeed: string;
  }) {
    const config = await this.getConfig();

    if (!config.enabled) throw new BadRequestException("Plinko is currently disabled");
    if (!VALID_ROWS.includes(input.rows)) throw new BadRequestException("Invalid row count (8/12/16/24)");
    if (!VALID_RISK.includes(input.riskLevel as RiskLevel)) throw new BadRequestException("Invalid risk level");
    if (input.betAmount < config.minBet) throw new BadRequestException(`Minimum bet is ${config.minBet}`);
    if (input.betAmount > config.maxBet) throw new BadRequestException(`Maximum bet is ${config.maxBet}`);
    if (!input.clientSeed?.trim()) throw new BadRequestException("Client seed required");

    // Deduct bet from wallet first
    await this.wallet.applyLedger({
      userId,
      amount: -input.betAmount,
      kind: LedgerKind.CASINO_BET,
      refType: "plinko",
      refId: userId,
      note: `Plinko ${input.rows}R ${input.riskLevel}`,
    });

    // Generate seeds & nonce
    const serverSeed     = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const nonce          = await this.prisma.plinkoBet.count({ where: { userId } }) + 1;

    // Biased outcome — RTP steers the slot, payouts stay fixed
    const { path, slot } = this.computeOutcome(serverSeed, input.clientSeed, nonce, input.rows, input.riskLevel as RiskLevel, config.rtpPercent);
    const multiplier = this.rawMultiplier(input.rows, input.riskLevel as RiskLevel, slot);
    const payout     = Math.min(
      Math.round(input.betAmount * multiplier * 100) / 100,
      config.maxPayout,
    );
    const profit = payout - input.betAmount;

    // Credit winnings
    if (payout > 0) {
      await this.wallet.applyLedger({
        userId,
        amount: payout,
        kind: LedgerKind.CASINO_WIN,
        refType: "plinko",
        refId: userId,
        note: `Plinko win ×${multiplier}`,
      });
    }

    // Persist
    const bet = await this.prisma.plinkoBet.create({
      data: {
        userId,
        betAmount:      new Prisma.Decimal(input.betAmount),
        rows:           input.rows,
        riskLevel:      input.riskLevel,
        serverSeed,
        serverSeedHash,
        clientSeed:     input.clientSeed,
        nonce,
        path,
        slot,
        multiplier:     new Prisma.Decimal(multiplier),
        payout:         new Prisma.Decimal(payout),
        profit:         new Prisma.Decimal(profit),
        rtpAtPlay:      new Prisma.Decimal(config.rtpPercent),
      },
      include: { user: { select: { username: true } } },
    });

    const result = {
      betId:      bet.id,
      userId,
      username:   bet.user.username,
      betAmount:  input.betAmount,
      rows:       input.rows,
      riskLevel:  input.riskLevel,
      path,
      slot,
      multiplier,
      payout,
      profit,
      serverSeedHash,
      nonce,
    };

    // Broadcast to live feed
    this.gateway.broadcastBet({
      betId:     bet.id,
      username:  bet.user.username,
      betAmount: input.betAmount,
      rows:      input.rows,
      riskLevel: input.riskLevel,
      slot,
      multiplier,
      payout,
    });

    return result;
  }

  // ── Provably Fair Verification ────────────────────────────────────────────

  async verifyBet(betId: string) {
    const bet = await this.prisma.plinkoBet.findUnique({ where: { id: betId } });
    if (!bet) throw new BadRequestException("Bet not found");

    const { path: recomputedPath, slot: recomputedSlot } =
      this.computeOutcome(bet.serverSeed, bet.clientSeed, bet.nonce, bet.rows, bet.riskLevel as RiskLevel, Number(bet.rtpAtPlay ?? 100));
    const seedHash       = crypto.createHash("sha256").update(bet.serverSeed).digest("hex");

    return {
      betId:          bet.id,
      serverSeed:     bet.serverSeed,
      serverSeedHash: bet.serverSeedHash,
      clientSeed:     bet.clientSeed,
      nonce:          bet.nonce,
      rows:           bet.rows,
      riskLevel:      bet.riskLevel,
      storedPath:     bet.path,
      recomputedPath,
      storedSlot:     bet.slot,
      recomputedSlot,
      hashVerified:   seedHash === bet.serverSeedHash,
      pathVerified:   JSON.stringify(recomputedPath) === JSON.stringify(bet.path),
      multiplier:     Number(bet.multiplier),
      payout:         Number(bet.payout),
    };
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getUserBets(userId: string, limit = 50) {
    return this.prisma.plinkoBet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
      select: {
        id: true, betAmount: true, rows: true, riskLevel: true,
        slot: true, multiplier: true, payout: true, profit: true,
        serverSeedHash: true, nonce: true, createdAt: true,
      },
    });
  }

  async getLiveBets(limit = 20) {
    return this.prisma.plinkoBet.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
      select: {
        id: true, betAmount: true, rows: true, riskLevel: true,
        slot: true, multiplier: true, payout: true, profit: true, createdAt: true,
        user: { select: { username: true } },
      },
    });
  }

  // ── Admin Stats ───────────────────────────────────────────────────────────

  async getAdminStats() {
    const [totalBets, agg, bigWins, recentBets] = await Promise.all([
      this.prisma.plinkoBet.count(),
      this.prisma.plinkoBet.aggregate({
        _sum: { betAmount: true, payout: true, profit: true },
        _avg: { multiplier: true, betAmount: true },
      }),
      this.prisma.plinkoBet.findMany({
        orderBy: { multiplier: "desc" },
        take: 5,
        include: { user: { select: { username: true } } },
      }),
      this.prisma.plinkoBet.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { username: true } } },
      }),
    ]);

    // Active players in last hour
    const hourAgo = new Date(Date.now() - 3_600_000);
    const activePlayers = await this.prisma.plinkoBet.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: hourAgo } },
    });

    const totalWagered = Number(agg._sum.betAmount ?? 0);
    const totalPaid    = Number(agg._sum.payout ?? 0);
    const houseProfit  = totalWagered - totalPaid;
    const actualRTP    = totalWagered > 0 ? (totalPaid / totalWagered) * 100 : 0;

    return {
      totalBets,
      totalWagered,
      totalPaid,
      houseProfit,
      actualRTP:     Math.round(actualRTP * 100) / 100,
      avgMultiplier: Math.round(Number(agg._avg.multiplier ?? 0) * 100) / 100,
      avgBet:        Math.round(Number(agg._avg.betAmount ?? 0) * 100) / 100,
      activePlayers: activePlayers.length,
      bigWins: bigWins.map(b => ({
        id: b.id,
        username: b.user.username,
        betAmount: Number(b.betAmount),
        multiplier: Number(b.multiplier),
        payout: Number(b.payout),
        rows: b.rows,
        riskLevel: b.riskLevel,
        createdAt: b.createdAt,
      })),
      recentBets: recentBets.map(b => ({
        id: b.id,
        username: b.user.username,
        betAmount: Number(b.betAmount),
        rows: b.rows,
        riskLevel: b.riskLevel,
        slot: b.slot,
        multiplier: Number(b.multiplier),
        payout: Number(b.payout),
        profit: Number(b.profit),
        createdAt: b.createdAt,
      })),
    };
  }

  async getAdminBets(opts: { limit?: number; userId?: string } = {}) {
    return this.prisma.plinkoBet.findMany({
      where: opts.userId ? { userId: opts.userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 50, 200),
      include: { user: { select: { id: true, username: true } } },
    });
  }
}
