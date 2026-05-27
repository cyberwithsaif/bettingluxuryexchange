import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { AdminService } from "../admin/admin.service";
import { Prisma, LedgerKind, DiceMode } from "@prisma/client";
import * as crypto from "crypto";

// ─── Provably Fair RNG ────────────────────────────────────────────────────────
// HMAC-SHA256 → two independent uniforms in [0, 1):
//   u1 decides win/loss (against the RTP-biased probability)
//   u2 places the displayed roll inside the matching win/loss region
function hmacUniforms(serverSeed: string, clientSeed: string, nonce: number): [number, number] {
  const hex = crypto.createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}`).digest("hex");
  const u1 = parseInt(hex.slice(0, 8), 16) / 0x100000000;
  const u2 = parseInt(hex.slice(8, 16), 16) / 0x100000000;
  return [u1, u2];
}

// Place a roll value (0.00–99.99) inside the winning or losing region so the
// displayed number always matches the (RTP-controlled) win/loss outcome.
function rollForOutcome(mode: DiceMode, won: boolean, target: number, minTarget: number, maxTarget: number, u: number): number {
  const clamp = (r: number) => Math.min(99.99, Math.max(0, Math.floor(r * 100) / 100));
  const inOne = (lo: number, hi: number) => clamp(lo + u * (hi - lo));
  const inTwo = (a: number, b: number) => { // regions [0,a) ∪ (b,100]
    const lowLen = a, highLen = 100 - b, total = lowLen + highLen;
    if (total <= 0) return inOne(0, a);
    const t = u * total;
    return clamp(t < lowLen ? t : b + (t - lowLen));
  };
  switch (mode) {
    case "ROLL_UNDER":   return won ? inOne(0, target) : inOne(target, 100);
    case "ROLL_OVER":    return won ? inOne(target, 100) : inOne(0, target);
    case "ROLL_BETWEEN": return won ? inOne(minTarget, maxTarget) : inTwo(minTarget, maxTarget);
    case "ROLL_OUTSIDE": return won ? inTwo(minTarget, maxTarget) : inOne(minTarget, maxTarget);
  }
}

// ─── Win Chance ───────────────────────────────────────────────────────────────
function calcWinChance(mode: DiceMode, target: number, minTarget: number, maxTarget: number): number {
  switch (mode) {
    case "ROLL_UNDER":    return target;
    case "ROLL_OVER":     return 100 - target;
    case "ROLL_BETWEEN":  return maxTarget - minTarget;
    case "ROLL_OUTSIDE":  return 100 - (maxTarget - minTarget);
  }
}

// ─── Multiplier — FIXED & fair (matches what the player sees) ─────────────────
// payout = 99 / winChance. This value NEVER changes; the admin RTP instead biases
// how often the player wins (see placeBet), so payouts always look fair.
function calcMultiplier(winChance: number): number {
  if (winChance <= 0) return 0;
  return Math.floor((99 / winChance) * 10000) / 10000;
}

@Injectable()
export class DiceService {
  private readonly logger = new Logger(DiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly adminService: AdminService,
  ) {}

  private async getConfig() {
    const settings = await this.adminService.getPlatformSettings() as any;
    return {
      houseEdge:  Number(settings.diceHouseEdge ?? 0.01),
      minBet:     Number(settings.diceMinBet    ?? 10),
      maxBet:     Number(settings.diceMaxBet    ?? 1_000_000),
      enabled:    settings.diceEnabled !== false,
    };
  }

  // ─── Place Bet ─────────────────────────────────────────────────────────────
  async placeBet(
    userId: string,
    betAmount: number,
    mode: DiceMode,
    target: number,
    minTarget: number,
    maxTarget: number,
    clientSeed: string,
    nonce: number,
  ) {
    const cfg = await this.getConfig();

    if (!cfg.enabled)         throw new BadRequestException("Dice game is currently disabled");
    if (!Number.isFinite(betAmount)) throw new BadRequestException("Invalid bet amount");
    if (betAmount < cfg.minBet) throw new BadRequestException(`Minimum bet is ₹${cfg.minBet}`);
    if (betAmount > cfg.maxBet) throw new BadRequestException(`Maximum bet is ₹${cfg.maxBet}`);
    if (!clientSeed?.trim())   throw new BadRequestException("Client seed is required");

    // Validate ranges
    if (mode === "ROLL_UNDER" || mode === "ROLL_OVER") {
      if (target < 2 || target > 98) throw new BadRequestException("Target must be between 2 and 98");
    }
    if (mode === "ROLL_BETWEEN" || mode === "ROLL_OUTSIDE") {
      if (minTarget < 1 || maxTarget > 99 || minTarget >= maxTarget)
        throw new BadRequestException("Invalid range: min must be < max, both between 1–99");
      if (maxTarget - minTarget < 1) throw new BadRequestException("Range too narrow");
    }

    const winChance = calcWinChance(mode, target, minTarget, maxTarget);
    if (winChance < 0.01 || winChance > 98.99)
      throw new BadRequestException("Win chance must be between 0.01% and 98.99%");

    const multiplier = calcMultiplier(winChance); // fixed/fair, never scaled

    // Deduct bet from wallet
    await this.wallet.applyLedger({
      userId,
      amount: -betAmount,
      kind: LedgerKind.CASINO_BET,
      refType: "dice_bet",
      refId: "pending",
      note: `Dice ${mode} bet`,
    });

    // Generate provably fair result — RTP biases the win probability, not the payout.
    // target RTP T = 1 - houseEdge (edge -1 ⇒ T=2 ⇒ players win). EV = pWin × multiplier = T.
    const serverSeed     = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const T              = 1 - cfg.houseEdge;
    const pWin           = Math.min(1, Math.max(0, (T * winChance) / 99));
    const [u1, u2]       = hmacUniforms(serverSeed, clientSeed, nonce);
    const won            = u1 < pWin;
    const roll           = rollForOutcome(mode, won, target, minTarget, maxTarget, u2);
    const payout         = won ? betAmount * multiplier : 0;
    const profit         = payout - betAmount;

    const bet = await this.prisma.diceBet.create({
      data: {
        userId,
        betAmount:  new Prisma.Decimal(betAmount),
        mode,
        target:     new Prisma.Decimal(target),
        minTarget:  minTarget != null ? new Prisma.Decimal(minTarget) : null,
        maxTarget:  maxTarget != null ? new Prisma.Decimal(maxTarget) : null,
        winChance:  new Prisma.Decimal(winChance),
        multiplier: new Prisma.Decimal(multiplier),
        roll:       new Prisma.Decimal(roll),
        won,
        payout:     new Prisma.Decimal(payout),
        profit:     new Prisma.Decimal(profit),
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });

    // Update the pending ledger entry with actual bet id
    await this.prisma.ledgerEntry.updateMany({
      where: { userId, refType: "dice_bet", refId: "pending" },
      data: { refId: bet.id },
    });

    // Credit payout if won
    if (won && payout > 0) {
      await this.wallet.applyLedger({
        userId,
        amount: payout,
        kind: LedgerKind.CASINO_WIN,
        refType: "dice_win",
        refId: bet.id,
        note: `Dice win (${multiplier.toFixed(4)}x)`,
      });
    }

    return {
      id:             bet.id,
      roll,
      won,
      payout,
      profit,
      multiplier,
      winChance,
      mode,
      target,
      minTarget,
      maxTarget,
      betAmount,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      createdAt: bet.createdAt,
    };
  }

  // ─── New Server Seed (for provably fair rotation) ─────────────────────────
  getNewServerSeedHash(): { serverSeedHash: string; _serverSeed: string } {
    const serverSeed     = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    return { serverSeedHash, _serverSeed: serverSeed };
  }

  // ─── User Bet History ─────────────────────────────────────────────────────
  async getUserBets(userId: string, limit = 50) {
    return this.prisma.diceBet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  // ─── Public Recent Results ─────────────────────────────────────────────────
  async getRecentResults(limit = 50) {
    return this.prisma.diceBet.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { username: true } } },
    });
  }

  // ─── Admin Stats ──────────────────────────────────────────────────────────
  async getAdminStats() {
    const [total, wins, losses] = await Promise.all([
      this.prisma.diceBet.count(),
      this.prisma.diceBet.findMany({ where: { won: true }, select: { betAmount: true, payout: true } }),
      this.prisma.diceBet.findMany({ where: { won: false }, select: { betAmount: true } }),
    ]);

    const totalBetsVol  = [...wins.map(w => Number(w.betAmount)), ...losses.map(l => Number(l.betAmount))].reduce((s, v) => s + v, 0);
    const totalPayouts  = wins.reduce((s, w) => s + Number(w.payout), 0);
    const houseProfit   = totalBetsVol - totalPayouts;

    return { total, totalWins: wins.length, totalLosses: losses.length, totalBetsVol, totalPayouts, houseProfit };
  }

  async getAdminHistory(opts: { limit?: number; skip?: number; won?: string; username?: string }) {
    const where: any = {};
    if (opts.won === "true")  where.won = true;
    if (opts.won === "false") where.won = false;
    if (opts.username) where.user = { username: { contains: opts.username, mode: "insensitive" } };

    return this.prisma.diceBet.findMany({
      where,
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 50,
      skip: opts.skip ?? 0,
    });
  }
}
