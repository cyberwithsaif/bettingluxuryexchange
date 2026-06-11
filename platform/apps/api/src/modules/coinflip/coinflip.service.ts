import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { AdminService } from "../admin/admin.service";
import { Prisma, LedgerKind, CoinflipStatus } from "@prisma/client";
import * as crypto from "crypto";

export type CoinSide = "HEADS" | "TAILS";

// Streak ladder: each correct call multiplies the payout by STEP_MULTIPLIER.
// 1.98 = the classic "fair-looking" coinflip payout (2x minus 1% baked edge).
// This value is FIXED and shown to the player; the admin RTP instead biases
// the per-flip win probability (see flip), so the ladder always looks fair.
const STEP_MULTIPLIER = 1.98;
const MAX_FLIPS = 10; // 1.98^10 ≈ 919x — auto-cashout after the 10th win

export interface FlipRecord {
  side: CoinSide;
  result: CoinSide;
  won: boolean;
}

// Deterministic per-flip uniform in [0,1) for the RTP-biased outcome roll.
function flipUniform(serverSeed: string, clientSeed: string, nonce: number, flipIndex: number): number {
  const h = crypto.createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:flip:${flipIndex}`).digest("hex");
  return parseInt(h.slice(0, 8), 16) / 0x100000000;
}

function ladder(): number[] {
  return Array.from({ length: MAX_FLIPS }, (_, i) => +(Math.pow(STEP_MULTIPLIER, i + 1).toFixed(2)));
}

@Injectable()
export class CoinflipService {
  private readonly logger = new Logger(CoinflipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly adminService: AdminService,
  ) {}

  private async getConfig() {
    const s = await this.adminService.getPlatformSettings() as any;
    return {
      houseEdge: Number(s.coinflipHouseEdge ?? 0.01),
      minBet:    Number(s.coinflipMinBet ?? 10),
      maxBet:    Number(s.coinflipMaxBet ?? 100_000),
      enabled:   s.coinflipEnabled !== false,
    };
  }

  async getPublicConfig() {
    const cfg = await this.getConfig();
    return {
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      enabled: cfg.enabled,
      stepMultiplier: STEP_MULTIPLIER,
      maxFlips: MAX_FLIPS,
      multiplierTable: ladder(),
    };
  }

  // ─── Start: debit bet, create session, resolve the FIRST flip immediately ──
  async startGame(userId: string, betAmount: number, side: CoinSide, clientSeed: string) {
    const cfg = await this.getConfig();
    if (!cfg.enabled)                throw new BadRequestException("Coinflip is currently disabled");
    if (!Number.isFinite(betAmount)) throw new BadRequestException("Invalid bet amount");
    if (betAmount < cfg.minBet)      throw new BadRequestException(`Minimum bet is ₹${cfg.minBet}`);
    if (betAmount > cfg.maxBet)      throw new BadRequestException(`Maximum bet is ₹${cfg.maxBet}`);
    if (side !== "HEADS" && side !== "TAILS") throw new BadRequestException("Pick HEADS or TAILS");
    if (!clientSeed?.trim())         throw new BadRequestException("Client seed required");

    const existing = await this.prisma.coinflipSession.findFirst({
      where: { userId, status: CoinflipStatus.IN_PROGRESS },
    });
    if (existing) throw new BadRequestException("You have an active game — cashout first");

    await this.wallet.applyLedger({
      userId,
      amount:  -betAmount,
      kind:    LedgerKind.CASINO_BET,
      refType: "coinflip_bet",
      refId:   "pending",
      note:    "Coinflip bet",
    });

    const serverSeed     = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const nonce          = 1;

    const session = await this.prisma.coinflipSession.create({
      data: {
        userId,
        betAmount: new Prisma.Decimal(betAmount),
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        status:     CoinflipStatus.IN_PROGRESS,
        streak:     0,
        multiplier: new Prisma.Decimal(1),
        flips:      [],
      },
    });

    await this.prisma.ledgerEntry.updateMany({
      where: { userId, refType: "coinflip_bet", refId: "pending" },
      data:  { refId: session.id },
    });

    // Resolve the first flip in the same round-trip for a snappy UX.
    return this.resolveFlip(session, side, cfg);
  }

  // ─── Flip the next coin in an active session ───────────────────────────────
  async flip(userId: string, sessionId: string, side: CoinSide) {
    if (side !== "HEADS" && side !== "TAILS") throw new BadRequestException("Pick HEADS or TAILS");
    const session = await this.prisma.coinflipSession.findUnique({ where: { id: sessionId } });
    if (!session)                                       throw new BadRequestException("Session not found");
    if (session.userId !== userId)                      throw new BadRequestException("Unauthorized");
    if (session.status !== CoinflipStatus.IN_PROGRESS)  throw new BadRequestException("Game is not in progress");
    const cfg = await this.getConfig();
    return this.resolveFlip(session, side, cfg);
  }

  private async resolveFlip(
    session: { id: string; userId: string; betAmount: Prisma.Decimal; serverSeed: string; serverSeedHash: string; clientSeed: string; nonce: number; streak: number; flips: Prisma.JsonValue },
    side: CoinSide,
    cfg: { houseEdge: number },
  ) {
    const flipIndex = session.streak; // 0-based index of this flip
    if (flipIndex >= MAX_FLIPS) throw new BadRequestException("Max flips reached — cashout");

    // RTP biases the per-flip win chance (not the payout ladder). T = 1 - houseEdge:
    // EV per flip = pWin × STEP_MULTIPLIER = T  ⇒  pWin = T / 1.98.
    // Default edge 0.01 ⇒ pWin = 0.5 exactly (a genuinely fair coin).
    const T      = 1 - cfg.houseEdge;
    const pWin   = Math.min(1, Math.max(0, T / STEP_MULTIPLIER));
    const u      = flipUniform(session.serverSeed, session.clientSeed, session.nonce, flipIndex);
    const won    = u < pWin;
    const result: CoinSide = won ? side : (side === "HEADS" ? "TAILS" : "HEADS");

    const flips: FlipRecord[] = [...(session.flips as unknown as FlipRecord[]), { side, result, won }];

    if (!won) {
      // Optimistic guard (status+streak) so a double-emitted flip can't settle twice.
      const updated = await this.prisma.coinflipSession.updateMany({
        where: { id: session.id, status: CoinflipStatus.IN_PROGRESS, streak: session.streak },
        data: {
          status:    CoinflipStatus.LOST,
          flips:     flips as unknown as Prisma.InputJsonValue,
          payout:    new Prisma.Decimal(0),
          settledAt: new Date(),
        },
      });
      if (updated.count === 0) throw new BadRequestException("Flip already resolved");

      return {
        sessionId: session.id,
        won: false as const,
        result,
        side,
        status: CoinflipStatus.LOST,
        streak: session.streak,
        multiplier: 0,
        payout: 0,
        nextMultiplier: null,
        serverSeed: session.serverSeed,
        serverSeedHash: session.serverSeedHash,
        clientSeed: session.clientSeed,
        nonce: session.nonce,
        flips,
      };
    }

    const newStreak = session.streak + 1;
    const newMult   = +(Math.pow(STEP_MULTIPLIER, newStreak).toFixed(4));

    if (newStreak >= MAX_FLIPS) {
      // Streak complete — auto cashout at the top of the ladder.
      return this.settleCashout(session, flips, newStreak, newMult, true);
    }

    const updated = await this.prisma.coinflipSession.updateMany({
      where: { id: session.id, status: CoinflipStatus.IN_PROGRESS, streak: session.streak },
      data: {
        streak:     newStreak,
        multiplier: new Prisma.Decimal(newMult),
        flips:      flips as unknown as Prisma.InputJsonValue,
      },
    });
    if (updated.count === 0) throw new BadRequestException("Flip already resolved");

    return {
      sessionId: session.id,
      won: true as const,
      result,
      side,
      status: CoinflipStatus.IN_PROGRESS,
      streak: newStreak,
      multiplier: newMult,
      payout: +(Number(session.betAmount) * newMult).toFixed(2),
      nextMultiplier: +(Math.pow(STEP_MULTIPLIER, newStreak + 1).toFixed(2)),
      serverSeedHash: session.serverSeedHash,
      flips,
    };
  }

  // ─── Cashout ────────────────────────────────────────────────────────────────
  async cashout(userId: string, sessionId: string) {
    const session = await this.prisma.coinflipSession.findUnique({ where: { id: sessionId } });
    if (!session)                                      throw new BadRequestException("Session not found");
    if (session.userId !== userId)                     throw new BadRequestException("Unauthorized");
    if (session.status !== CoinflipStatus.IN_PROGRESS) throw new BadRequestException("Game is not in progress");
    if (session.streak === 0)                          throw new BadRequestException("Win at least one flip first");

    const mult = Number(session.multiplier);
    return this.settleCashout(session, session.flips as unknown as FlipRecord[], session.streak, mult, false);
  }

  private async settleCashout(
    session: { id: string; userId: string; betAmount: Prisma.Decimal; serverSeed: string; serverSeedHash: string; clientSeed: string; nonce: number; streak: number },
    flips: FlipRecord[],
    streak: number,
    multiplier: number,
    isAutoWin: boolean,
  ) {
    const payout = +(Number(session.betAmount) * multiplier).toFixed(2);

    const updated = await this.prisma.coinflipSession.updateMany({
      where: { id: session.id, status: CoinflipStatus.IN_PROGRESS },
      data: {
        status:     CoinflipStatus.CASHED_OUT,
        streak,
        multiplier: new Prisma.Decimal(multiplier),
        payout:     new Prisma.Decimal(payout),
        flips:      flips as unknown as Prisma.InputJsonValue,
        settledAt:  new Date(),
      },
    });
    if (updated.count === 0) throw new BadRequestException("Game already settled");

    await this.wallet.applyLedger({
      userId:  session.userId,
      amount:  payout,
      kind:    LedgerKind.CASINO_WIN,
      refType: "coinflip_win",
      refId:   session.id,
      note:    `Coinflip cashout ${multiplier}x${isAutoWin ? " (max streak)" : ""}`,
    });

    return {
      sessionId: session.id,
      won: true as const,
      result: flips.length ? flips[flips.length - 1]!.result : null,
      side:   flips.length ? flips[flips.length - 1]!.side : null,
      status: CoinflipStatus.CASHED_OUT,
      streak,
      multiplier,
      payout,
      nextMultiplier: null,
      serverSeed: session.serverSeed,
      serverSeedHash: session.serverSeedHash,
      clientSeed: session.clientSeed,
      nonce: session.nonce,
      flips,
      isAutoWin,
    };
  }

  // ─── Restore an in-progress session (page refresh / nav back) ──────────────
  async getActiveSession(userId: string) {
    const session = await this.prisma.coinflipSession.findFirst({
      where: { userId, status: CoinflipStatus.IN_PROGRESS },
    });
    if (!session) return null;
    return {
      id: session.id,
      betAmount: Number(session.betAmount),
      status: session.status,
      streak: session.streak,
      multiplier: Number(session.multiplier),
      payout: +(Number(session.betAmount) * Number(session.multiplier)).toFixed(2),
      nextMultiplier: session.streak < MAX_FLIPS ? +(Math.pow(STEP_MULTIPLIER, session.streak + 1).toFixed(2)) : null,
      serverSeedHash: session.serverSeedHash,
      clientSeed: session.clientSeed,
      nonce: session.nonce,
      flips: session.flips,
      stepMultiplier: STEP_MULTIPLIER,
      maxFlips: MAX_FLIPS,
      multiplierTable: ladder(),
    };
  }

  // ─── Feeds & history ────────────────────────────────────────────────────────
  async getRecentResults(limit = 20) {
    const rows = await this.prisma.coinflipSession.findMany({
      where:   { status: { in: [CoinflipStatus.CASHED_OUT, CoinflipStatus.LOST] } },
      orderBy: { settledAt: "desc" },
      take:    limit,
      include: { user: { select: { username: true } } },
    });
    return rows.map(s => ({
      id: s.id, username: s.user.username, betAmount: Number(s.betAmount),
      multiplier: Number(s.multiplier), payout: Number(s.payout),
      streak: s.streak, status: s.status, createdAt: s.createdAt,
    }));
  }

  async getUserBets(userId: string, limit = 50) {
    return this.prisma.coinflipSession.findMany({
      where: { userId, status: { not: CoinflipStatus.IN_PROGRESS } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────
  async getAdminStats() {
    const [total, active, wins, losses] = await Promise.all([
      this.prisma.coinflipSession.count(),
      this.prisma.coinflipSession.count({ where: { status: CoinflipStatus.IN_PROGRESS } }),
      this.prisma.coinflipSession.findMany({ where: { status: CoinflipStatus.CASHED_OUT }, select: { betAmount: true, payout: true } }),
      this.prisma.coinflipSession.findMany({ where: { status: CoinflipStatus.LOST }, select: { betAmount: true } }),
    ]);
    const vol     = [...wins.map(w => Number(w.betAmount)), ...losses.map(l => Number(l.betAmount))].reduce((a, v) => a + v, 0);
    const payouts = wins.reduce((a, w) => a + Number(w.payout), 0);
    return { total, active, totalBetsVol: vol, totalPayouts: payouts, houseProfit: vol - payouts };
  }

  async getAdminHistory(opts: { limit?: number; skip?: number; status?: string; username?: string }) {
    const where: any = {};
    if (opts.status && opts.status !== "ALL") where.status = opts.status;
    if (opts.username) where.user = { username: { contains: opts.username, mode: "insensitive" } };
    return this.prisma.coinflipSession.findMany({
      where, include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" }, take: opts.limit ?? 50, skip: opts.skip ?? 0,
    });
  }

  async expireStale(maxAgeMinutes = 120) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
    const stale  = await this.prisma.coinflipSession.findMany({
      where: { status: CoinflipStatus.IN_PROGRESS, createdAt: { lt: cutoff } },
      select: { id: true, userId: true, betAmount: true, multiplier: true, streak: true },
    });
    if (!stale.length) return { expired: 0 };
    // Refund stale sessions at their current multiplier (streak ≥ 1) or void at 1x —
    // the player walked away mid-game; settle what they had locked in.
    for (const s of stale) {
      const mult   = s.streak > 0 ? Number(s.multiplier) : 1;
      const payout = +(Number(s.betAmount) * mult).toFixed(2);
      const updated = await this.prisma.coinflipSession.updateMany({
        where: { id: s.id, status: CoinflipStatus.IN_PROGRESS },
        data:  { status: CoinflipStatus.CASHED_OUT, payout: new Prisma.Decimal(payout), settledAt: new Date() },
      });
      if (updated.count > 0 && payout > 0) {
        await this.wallet.applyLedger({
          userId: s.userId, amount: payout, kind: LedgerKind.CASINO_WIN,
          refType: "coinflip_win", refId: s.id, note: `Coinflip auto-settle (stale) ${mult}x`,
        });
      }
    }
    return { expired: stale.length };
  }
}
