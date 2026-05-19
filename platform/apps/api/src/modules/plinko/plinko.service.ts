import { Injectable, Logger, BadRequestException, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { PlinkoGateway } from "./plinko.gateway";
import { AdminService } from "../admin/admin.service";
import { LedgerKind, Prisma } from "@prisma/client";
import * as crypto from "crypto";

// ── Multiplier tables ──────────────────────────────────────────────────────
// rows+1 slots per row count. Symmetric around center.
// Base expected value ≈ 99%. Admin RTP setting scales these proportionally.
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
  rtpPercent: number;  // 80–100 — scales all multipliers
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

  // ── Provably Fair ─────────────────────────────────────────────────────────

  /** HMAC-SHA256(serverSeed, clientSeed:nonce) → N bits = left/right per row */
  private computePath(serverSeed: string, clientSeed: string, nonce: number, rows: number): number[] {
    const hmac = crypto
      .createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest();

    const path: number[] = [];
    for (let i = 0; i < rows; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx  = i % 8;
      path.push((hmac[byteIdx] >> bitIdx) & 1);
    }
    return path;
  }

  /** Get raw (unscaled) multiplier for a given slot. */
  private rawMultiplier(rows: number, risk: RiskLevel, slot: number): number {
    return MULTIPLIERS[rows]?.[risk]?.[slot] ?? 0;
  }

  /** Apply RTP scaling: multiplier * (rtpPercent / 99). 99 = base table RTP. */
  private scaledMultiplier(rows: number, risk: RiskLevel, slot: number): number {
    const raw = this.rawMultiplier(rows, risk, slot);
    const scale = this.config.rtpPercent / 99;
    return Math.round(raw * scale * 100) / 100;
  }

  /** Return full multiplier table for a rows+risk combination (scaled). */
  getMultiplierTable(rows: number, risk: string): number[] {
    const table = MULTIPLIERS[rows]?.[risk];
    if (!table) return [];
    const scale = this.config.rtpPercent / 99;
    return table.map(m => Math.round(m * scale * 100) / 100);
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

    // Compute path and outcome
    const path       = this.computePath(serverSeed, input.clientSeed, nonce, input.rows);
    const slot       = path.reduce((a, b) => a + b, 0); // count of rights = final slot
    const multiplier = this.scaledMultiplier(input.rows, input.riskLevel as RiskLevel, slot);
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

    const recomputedPath = this.computePath(bet.serverSeed, bet.clientSeed, bet.nonce, bet.rows);
    const recomputedSlot = recomputedPath.reduce((a, b) => a + b, 0);
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
