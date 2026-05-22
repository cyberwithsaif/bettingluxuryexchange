import { Injectable, BadRequestException } from "@nestjs/common";
import { BetStatus, LedgerKind, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [users, openBets, activeMarkets, pendingDeposits, pendingWithdrawals, totals] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.bet.count({ where: { status: "OPEN" } }),
        this.prisma.market.count({ where: { status: { in: ["OPEN", "SUSPENDED"] } } }),
        this.prisma.transaction.count({ where: { kind: "DEPOSIT",    status: "PENDING" } }),
        this.prisma.transaction.count({ where: { kind: "WITHDRAWAL", status: "PENDING" } }),
        this.prisma.wallet.aggregate({ _sum: { balance: true, exposure: true } }),
      ]);

    // 7-day P/L per day from settlement entries.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const recent = await this.prisma.ledgerEntry.findMany({
      where: { kind: { in: ["BET_SETTLE_WIN", "BET_SETTLE_LOSS"] }, createdAt: { gte: sevenDaysAgo } },
      select: { amount: true, createdAt: true },
    });
    const buckets: Record<string, number> = {};
    for (const e of recent) {
      const day = e.createdAt.toISOString().slice(0, 10);
      // Operator P/L is the negative of user P/L (zero-sum exchange minus commission).
      buckets[day] = (buckets[day] ?? 0) - Number(e.amount.toString());
    }
    const series = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, pl]) => ({ date, pl: Math.round(pl * 100) / 100 }));

    return {
      users,
      openBets,
      activeMarkets,
      pendingDeposits,
      pendingWithdrawals,
      totalBalance:  Number((totals._sum.balance  ?? new Prisma.Decimal(0)).toString()),
      totalExposure: Number((totals._sum.exposure ?? new Prisma.Decimal(0)).toString()),
      pl7d: series,
    };
  }

  /** Top exposed users (real-time risk monitor). */
  liveRisk(limit = 25) {
    return this.prisma.wallet.findMany({
      orderBy: { exposure: "desc" },
      take: limit,
      include: { user: { select: { id: true, username: true, role: true } } },
    });
  }

  async writeAudit(actorId: string | undefined, action: string, target?: { type: string; id: string }, metadata?: unknown, ip?: string) {
    await this.prisma.adminLog.create({
      data: {
        actorId,
        action,
        targetType: target?.type,
        targetId: target?.id,
        metadata: metadata as Prisma.InputJsonValue,
        ip,
      },
    });
  }

  listLogs(opts: { actorId?: string; action?: string; limit?: number } = {}) {
    return this.prisma.adminLog.findMany({
      where: {
        ...(opts.actorId ? { actorId: opts.actorId } : {}),
        ...(opts.action ? { action: { contains: opts.action } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 100, 500),
      include: { actor: { select: { id: true, username: true, role: true } } },
    });
  }

  /** All bets across all users — paginated, filterable by username / status. */
  async listAllBets(opts: { username?: string; status?: string; limit?: number; skip?: number } = {}) {
    const where: Prisma.BetWhereInput = {};
    if (opts.username) {
      where.user = { username: { contains: opts.username, mode: "insensitive" } };
    }
    if (opts.status) {
      where.status = opts.status as Prisma.EnumBetStatusFilter;
    }
    return this.prisma.bet.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 50, 200),
      skip: opts.skip ?? 0,
      include: {
        user: { select: { id: true, username: true, role: true } },
        market: { select: { id: true, name: true, type: true } },
        runner: { select: { id: true, name: true } },
      },
    });
  }

  /** All casino bets across all game types — paginated, filterable. */
  async listAllCasinoBets(opts: { username?: string; game?: string; limit?: number; skip?: number } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const skip = opts.skip ?? 0;
    const FETCH_LIMIT = 1000;

    const userFilter = opts.username
      ? { user: { username: { contains: opts.username, mode: "insensitive" as const } } }
      : {};

    type CasinoBet = {
      id: string; game: string;
      user: { id: string; username: string };
      betAmount: number; payout: number; profit: number;
      status: string; extra: string; createdAt: Date;
    };

    const all: CasinoBet[] = [];
    const g = opts.game;

    const [mines, plinko, pump, dice, roulette] = await Promise.all([
      (!g || g === "mines") ? this.prisma.minesSession.findMany({
        where: { ...userFilter, status: { not: "IN_PROGRESS" } },
        orderBy: { createdAt: "desc" }, take: FETCH_LIMIT,
        include: { user: { select: { id: true, username: true } } },
      }) : [],
      (!g || g === "plinko") ? this.prisma.plinkoBet.findMany({
        where: userFilter,
        orderBy: { createdAt: "desc" }, take: FETCH_LIMIT,
        include: { user: { select: { id: true, username: true } } },
      }) : [],
      (!g || g === "pump") ? this.prisma.pumpBet.findMany({
        where: { ...userFilter, status: { not: "ACTIVE" } },
        orderBy: { createdAt: "desc" }, take: FETCH_LIMIT,
        include: { user: { select: { id: true, username: true } } },
      }) : [],
      (!g || g === "dice") ? this.prisma.diceBet.findMany({
        where: userFilter,
        orderBy: { createdAt: "desc" }, take: FETCH_LIMIT,
        include: { user: { select: { id: true, username: true } } },
      }) : [],
      (!g || g === "roulette") ? this.prisma.rouletteBet.findMany({
        where: { ...userFilter, settledAt: { not: null } },
        orderBy: { createdAt: "desc" }, take: FETCH_LIMIT,
        include: { user: { select: { id: true, username: true } } },
      }) : [],
    ]);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    for (const r of mines as any[]) {
      const bet = Number(r.betAmount); const pay = Number(r.payout);
      all.push({ id: r.id, game: "mines", user: r.user, betAmount: bet, payout: pay, profit: pay - bet, status: r.status === "CASHED_OUT" ? "WON" : "LOST", extra: `${r.minesCount} mines`, createdAt: r.createdAt });
    }
    for (const r of plinko as any[]) {
      const bet = Number(r.betAmount); const pay = Number(r.payout); const profit = Number(r.profit);
      all.push({ id: r.id, game: "plinko", user: r.user, betAmount: bet, payout: pay, profit, status: profit >= 0 ? "WON" : "LOST", extra: `${r.rows}r ${r.riskLevel}`, createdAt: r.createdAt });
    }
    for (const r of pump as any[]) {
      const bet = Number(r.betAmount); const pay = Number(r.payout);
      all.push({ id: r.id, game: "pump", user: r.user, betAmount: bet, payout: pay, profit: pay - bet, status: r.status === "CASHED" ? "WON" : "LOST", extra: `${r.pumpsCount} pumps`, createdAt: r.createdAt });
    }
    for (const r of dice as any[]) {
      const bet = Number(r.betAmount); const pay = Number(r.payout); const profit = Number(r.profit);
      all.push({ id: r.id, game: "dice", user: r.user, betAmount: bet, payout: pay, profit, status: r.won ? "WON" : "LOST", extra: `roll ${Number(r.roll).toFixed(2)}`, createdAt: r.createdAt });
    }
    for (const r of roulette as any[]) {
      const bet = Number(r.amount); const pay = Number(r.payout);
      all.push({ id: r.id, game: "roulette", user: r.user, betAmount: bet, payout: pay, profit: pay - bet, status: r.isWin ? "WON" : "LOST", extra: r.betType, createdAt: r.createdAt });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return all.slice(skip, skip + limit);
  }

  /** Platform-level P/L report: volume + aggregate net over a period. */
  async getReports(opts: { days?: number } = {}) {
    const days = Math.min(opts.days ?? 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);

    const [totalBets, openBets, settledBets, ledger] = await Promise.all([
      this.prisma.bet.count({ where: { createdAt: { gte: since } } }),
      this.prisma.bet.count({ where: { status: { in: [BetStatus.OPEN, BetStatus.MATCHED] } } }),
      this.prisma.bet.count({ where: { status: { in: [BetStatus.SETTLED_WON, BetStatus.SETTLED_LOST] }, createdAt: { gte: since } } }),
      this.prisma.ledgerEntry.findMany({
        where: {
          kind: { in: [LedgerKind.BET_SETTLE_WIN, LedgerKind.BET_SETTLE_LOSS, LedgerKind.ADMIN_CREDIT, LedgerKind.ADMIN_DEBIT] },
          createdAt: { gte: since },
        },
        select: { amount: true, kind: true, createdAt: true },
      }),
    ]);

    // Daily buckets
    const daily: Record<string, { volume: number; pl: number }> = {};
    let totalWin = 0;
    let totalLoss = 0;
    for (const e of ledger) {
      const day = e.createdAt.toISOString().slice(0, 10);
      if (!daily[day]) daily[day] = { volume: 0, pl: 0 };
      const amt = Number(e.amount.toString());
      daily[day].volume += Math.abs(amt);
      if (e.kind === "BET_SETTLE_WIN") { totalWin += amt; daily[day].pl -= amt; }
      if (e.kind === "BET_SETTLE_LOSS") { totalLoss += Math.abs(amt); daily[day].pl += Math.abs(amt); }
    }

    const series = Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, volume: Math.round(d.volume * 100) / 100, pl: Math.round(d.pl * 100) / 100 }));

    return {
      days,
      totalBets,
      openBets,
      settledBets,
      totalUserWin: Math.round(totalWin * 100) / 100,
      totalOperatorPL: Math.round((totalLoss - totalWin) * 100) / 100,
      series,
    };
  }

  /** Void or cancel a single open bet. */
  async voidOrCancelBet(betId: string, action: "void" | "cancel") {
    const bet = await this.prisma.bet.findUniqueOrThrow({
      where: { id: betId },
      include: { user: true },
    });
    if (bet.status !== "OPEN" && bet.status !== "MATCHED") {
      throw new BadRequestException(`Bet is already ${bet.status}`);
    }
    const newStatus = action === "void" ? BetStatus.VOID : BetStatus.CANCELLED;
    // Refund the stake back to the user's wallet
    await this.prisma.$transaction(async (tx) => {
      await tx.bet.update({ where: { id: betId }, data: { status: newStatus } });
      const refund = Number(bet.stake.toString());
      const updatedWallet = await tx.wallet.update({
        where: { userId: bet.userId },
        data: {
          balance: { increment: refund },
          exposure: { decrement: refund },
        },
      });
      await tx.ledgerEntry.create({
        data: {
          userId: bet.userId,
          kind: LedgerKind.BET_VOID,
          amount: refund,
          balanceAfter: updatedWallet.balance,
          exposureAfter: updatedWallet.exposure,
          refType: "bet",
          refId: betId,
          note: `Bet ${action}ed by admin`,
        },
      });
    });
    return { betId, status: newStatus };
  }

  // ── Platform Settings ──────────────────────────────────────────────────────
  // Stored as a single row in the SystemConfig table (key = 'platform').

  async getPlatformSettings() {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: "platform" } });
    const defaults = {
      minStake: 100, maxStake: 100000, maxMarketExposure: 1000000,
      defaultPartnershipBps: 0, currency: "INR",
      maintenanceMode: false, registrationEnabled: true,
      depositEnabled: true, withdrawalEnabled: true,
    };
    if (!row) return defaults;
    return { ...defaults, ...(row.value as object) };
  }

  async savePlatformSettings(dto: Record<string, unknown>) {
    // Strip undefined values so they don't overwrite existing fields with null
    const clean = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    const jsonValue = JSON.stringify(clean);

    // Atomic JSONB merge — avoids read-modify-write race condition under cluster mode.
    // PostgreSQL's || operator merges at the top level: existing keys not in `clean` are preserved.
    await this.prisma.$executeRaw`
      INSERT INTO "SystemConfig" (key, value, "updatedAt")
      VALUES ('platform', ${jsonValue}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
        SET value      = "SystemConfig".value || ${jsonValue}::jsonb,
            "updatedAt" = NOW()
    `;

    return this.getPlatformSettings();
  }

  // ── User Profile ───────────────────────────────────────────────────────────

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true, limits: true },
    });
    if (!user) throw new BadRequestException("User not found");

    const [ledgerGroups, betGroups, minesAgg, minesGroups, recentLogins, recentTxns, recentBets, adminNotes] =
      await Promise.all([
        this.prisma.ledgerEntry.groupBy({
          by: ["kind"],
          where: { userId },
          _sum: { amount: true },
        }),
        this.prisma.bet.groupBy({
          by: ["status"],
          where: { userId },
          _count: { _all: true },
          _sum: { stake: true },
        }),
        this.prisma.minesSession.aggregate({
          where: { userId },
          _count: { _all: true },
          _sum: { betAmount: true, payout: true },
        }),
        this.prisma.minesSession.groupBy({
          by: ["status"],
          where: { userId },
          _count: { _all: true },
        }),
        this.prisma.refreshToken.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { userAgent: true, ip: true, createdAt: true },
        }),
        this.prisma.transaction.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 15,
          select: { id: true, kind: true, method: true, amount: true, status: true, reference: true, createdAt: true },
        }),
        this.prisma.bet.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 15,
          include: {
            market: { select: { name: true, type: true } },
            runner: { select: { name: true } },
          },
        }),
        this.prisma.adminLog.findMany({
          where: { targetId: userId, action: "admin.note" },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { actor: { select: { username: true } } },
        }),
      ]);

    // Ledger map: kind → signed sum
    const lm: Record<string, number> = {};
    for (const g of ledgerGroups) lm[g.kind] = Number(g._sum.amount ?? 0);

    // Bet stats
    const bm: Record<string, number> = {};
    for (const g of betGroups) bm[g.status] = g._count._all;
    const totalBets = betGroups.reduce((s, b) => s + b._count._all, 0);
    const wonBets   = bm["SETTLED_WON"]  ?? 0;
    const lostBets  = bm["SETTLED_LOST"] ?? 0;
    const totalBetStake = betGroups.reduce((s, b) => s + Number(b._sum.stake ?? 0), 0);

    // Mines stats
    const msm: Record<string, number> = {};
    for (const g of minesGroups) msm[g.status] = g._count._all;

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        lastLoginAt: user.lastLoginAt,
        lastLoginIp: user.lastLoginIp,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        partnershipBps: user.partnershipBps,
        creditReference: Number(user.creditReference),
      },
      wallet: {
        balance:  Number(user.wallet?.balance  ?? 0),
        exposure: Number(user.wallet?.exposure ?? 0),
        bonus:    Number(user.wallet?.bonus    ?? 0),
      },
      limits: user.limits ? {
        minStake:          Number(user.limits.minStake),
        maxStake:          Number(user.limits.maxStake),
        maxMarketExposure: Number(user.limits.maxMarketExposure),
        maxDailyLoss:      Number(user.limits.maxDailyLoss),
        betDelayMs:        user.limits.betDelayMs,
        fancyEnabled:      user.limits.fancyEnabled,
        casinoEnabled:     user.limits.casinoEnabled,
      } : null,
      financials: {
        totalDeposits:    Math.max(0,  lm["DEPOSIT"]          ?? 0),
        totalWithdrawals: Math.abs(Math.min(0, lm["WITHDRAWAL"] ?? 0)),
        casinoWins:       Math.max(0,  lm["CASINO_WIN"]        ?? 0),
        casinoBets:       Math.abs(Math.min(0, lm["CASINO_BET"] ?? 0)),
        betWins:          Math.max(0,  lm["BET_SETTLE_WIN"]    ?? 0),
        betLosses:        Math.abs(Math.min(0, lm["BET_SETTLE_LOSS"] ?? 0)),
        adminCredits:     Math.max(0,  lm["ADMIN_CREDIT"]      ?? 0),
        bonusGranted:     Math.max(0,  lm["BONUS_GRANT"]       ?? 0),
      },
      bettingStats: {
        total:      totalBets,
        won:        wonBets,
        lost:       lostBets,
        open:       bm["OPEN"]    ?? 0,
        cancelled:  bm["CANCELLED"] ?? 0,
        totalStake: totalBetStake,
        winRate:    (wonBets + lostBets) > 0 ? Number(((wonBets / (wonBets + lostBets)) * 100).toFixed(1)) : 0,
      },
      casinoStats: {
        totalGames: minesAgg._count._all,
        won:        msm["CASHED_OUT"] ?? 0,
        busted:     msm["BUSTED"]     ?? 0,
        totalBet:   Number(minesAgg._sum.betAmount ?? 0),
        totalPayout:Number(minesAgg._sum.payout    ?? 0),
      },
      recentLogins,
      recentTxns,
      recentBets,
      adminNotes,
    };
  }

  async addUserNote(actorId: string, targetUserId: string, note: string) {
    await this.writeAudit(actorId, "admin.note", { type: "user", id: targetUserId }, { note });
    return { ok: true };
  }
}

