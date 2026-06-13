import { Injectable, BadRequestException } from "@nestjs/common";
import { BetStatus, LedgerKind, MarketStatus, Prisma, TransactionStatus, UserRole } from "@prisma/client";
import { VIP_TIERS, getTierIndex, levelFromDeposits } from "@exch/shared";
import * as os from "os";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RedisService } from "../../common/redis/redis.service";

const PLATFORM_SETTINGS_CACHE_KEY = "cache:platform:settings";
const PLATFORM_SETTINGS_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async dashboard(rangeOpt?: { from?: Date; to?: Date }) {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const online15 = new Date(now - 15 * 60_000);
    const active24h = new Date(now - 24 * 60 * 60_000);

    // ── Date range (filter) ─────────────────────────────────────────────────
    // With a range: every "rangeStats" figure + all chart series cover [from, to].
    // Without one (All Time): rangeStats cover all time, charts show last 14 days.
    const hasRange = !!(rangeOpt?.from || rangeOpt?.to);
    const rangeFrom = rangeOpt?.from ?? null;
    const rangeTo = rangeOpt?.to ?? null;
    const inRange = hasRange
      ? { ...(rangeFrom ? { gte: rangeFrom } : {}), ...(rangeTo ? { lte: rangeTo } : {}) }
      : undefined;

    const WINDOW_DAYS = 14;
    const defaultStart = new Date(now - (WINDOW_DAYS - 1) * 24 * 60 * 60_000);
    defaultStart.setUTCHours(0, 0, 0, 0);
    const seriesStart = rangeFrom ?? defaultStart;
    const seriesEnd = rangeTo ?? new Date(now);

    // Bucket granularity scales with the span: hours for 1-2 days, days up to
    // ~6 weeks, weeks beyond that — so charts stay readable at any range.
    const spanMs = Math.max(1, seriesEnd.getTime() - seriesStart.getTime());
    const spanDays = spanMs / 86_400_000;
    const bucket: "hour" | "day" | "week" = spanDays <= 2.05 ? "hour" : spanDays <= 45 ? "day" : "week";
    const bucketMs = bucket === "hour" ? 3_600_000 : bucket === "day" ? 86_400_000 : 7 * 86_400_000;
    const startMs = bucket === "hour"
      ? Math.floor(seriesStart.getTime() / 3_600_000) * 3_600_000
      : Math.floor(seriesStart.getTime() / 86_400_000) * 86_400_000;
    const bucketCount = Math.min(120, Math.max(1, Math.ceil((seriesEnd.getTime() - startMs) / bucketMs)));
    const bucketLabel = (ms: number) => {
      const d = new Date(ms);
      if (bucket === "hour") return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
      return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      date: new Date(startMs + i * bucketMs).toISOString(),
      label: bucketLabel(startMs + i * bucketMs),
    }));
    const idxOf = (d: Date) => {
      const i = Math.floor((d.getTime() - startMs) / bucketMs);
      return i >= 0 && i < bucketCount ? i : -1;
    };

    // All ledger kinds that contribute to operator P/L. Operator P/L per entry is
    // the negative of the player's balance delta (zero-sum exchange + casino edge).
    const PL_KINDS: LedgerKind[] = [
      LedgerKind.BET_SETTLE_WIN, LedgerKind.BET_SETTLE_LOSS,
      LedgerKind.CASINO_BET, LedgerKind.CASINO_WIN, LedgerKind.CASINO_REFUND,
    ];
    const CASINO_PL_KINDS = ["CASINO_BET", "CASINO_WIN", "CASINO_REFUND"];
    const SPORTS_PL_KINDS = ["BET_SETTLE_WIN", "BET_SETTLE_LOSS"];
    const APPROVED = [TransactionStatus.APPROVED, TransactionStatus.COMPLETED];
    const seriesWhere = { gte: new Date(startMs), lte: seriesEnd };

    const [
      users, openBets, activeMarkets, pendingDeposits, pendingWithdrawals, totals,
      onlineUsers, activeUsers24h, newRegistrationsToday,
      depositAgg, withdrawalAgg, pendingWithdrawalAgg,
      sportsBetsCount, sportsWon, sportsLost, casinoBetCount, casinoWinCount,
      plAllTime, plToday, commissionAgg,
      recentLedger, recentBets, recentUsers, recentTx,
      // range-scoped
      depositAggR, withdrawalAggR, plRange, newUsersRange, sportsBetsRange, casinoBetsRange, referralPaidRange,
      casinoByGameRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.bet.count({ where: { status: "OPEN" } }),
      this.prisma.market.count({ where: { status: { in: ["OPEN", "SUSPENDED"] } } }),
      this.prisma.transaction.count({ where: { kind: "DEPOSIT",    status: "PENDING" } }),
      this.prisma.transaction.count({ where: { kind: "WITHDRAWAL", status: "PENDING" } }),
      this.prisma.wallet.aggregate({ _sum: { balance: true, exposure: true } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: online15 } } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: active24h } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, where: { kind: "DEPOSIT",    status: { in: APPROVED } } }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, where: { kind: "WITHDRAWAL", status: { in: APPROVED } } }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, where: { kind: "WITHDRAWAL", status: "PENDING" } }),
      this.prisma.bet.count(),
      this.prisma.bet.count({ where: { status: "SETTLED_WON" } }),
      this.prisma.bet.count({ where: { status: "SETTLED_LOST" } }),
      this.prisma.ledgerEntry.count({ where: { kind: "CASINO_BET" } }),
      this.prisma.ledgerEntry.count({ where: { kind: "CASINO_WIN", amount: { gt: 0 } } }),
      this.prisma.ledgerEntry.groupBy({ by: ["kind"], _sum: { amount: true }, where: { kind: { in: PL_KINDS } } }),
      this.prisma.ledgerEntry.groupBy({ by: ["kind"], _sum: { amount: true }, where: { kind: { in: PL_KINDS }, createdAt: { gte: startOfToday } } }),
      this.prisma.ledgerEntry.aggregate({ _sum: { amount: true }, where: { kind: "COMMISSION_PAYOUT" } }),
      this.prisma.ledgerEntry.findMany({ where: { createdAt: seriesWhere, kind: { in: PL_KINDS } }, select: { amount: true, kind: true, createdAt: true } }),
      this.prisma.bet.findMany({ where: { createdAt: seriesWhere }, select: { createdAt: true } }),
      this.prisma.user.findMany({ where: { createdAt: seriesWhere }, select: { createdAt: true } }),
      this.prisma.transaction.findMany({ where: { createdAt: seriesWhere, status: { in: APPROVED } }, select: { amount: true, kind: true, createdAt: true } }),
      // ── Range-scoped stats (fall back to all-time when no range is set) ──
      this.prisma.transaction.aggregate({ _sum: { amount: true }, _count: true, where: { kind: "DEPOSIT",    status: { in: APPROVED }, ...(inRange ? { createdAt: inRange } : {}) } }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, _count: true, where: { kind: "WITHDRAWAL", status: { in: APPROVED }, ...(inRange ? { createdAt: inRange } : {}) } }),
      this.prisma.ledgerEntry.groupBy({ by: ["kind"], _sum: { amount: true }, where: { kind: { in: PL_KINDS }, ...(inRange ? { createdAt: inRange } : {}) } }),
      this.prisma.user.count({ where: inRange ? { createdAt: inRange } : {} }),
      this.prisma.bet.count({ where: inRange ? { createdAt: inRange } : {} }),
      this.prisma.ledgerEntry.count({ where: { kind: "CASINO_BET", ...(inRange ? { createdAt: inRange } : {}) } }),
      this.prisma.ledgerEntry.aggregate({ _sum: { amount: true }, where: { kind: "COMMISSION_PAYOUT", refType: "referral", amount: { gt: 0 }, ...(inRange ? { createdAt: inRange } : {}) } }),
      this.prisma.ledgerEntry.groupBy({
        by: ["refType", "kind"], _sum: { amount: true }, _count: true,
        where: { kind: { in: [LedgerKind.CASINO_BET, LedgerKind.CASINO_WIN, LedgerKind.CASINO_REFUND] }, ...(inRange ? { createdAt: inRange } : {}) },
      }),
    ]);

    const num = (d: Prisma.Decimal | null | undefined) => Number((d ?? new Prisma.Decimal(0)).toString());
    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Fold groupBy rows into a { kind: amount } map.
    const foldKinds = (rows: Array<{ kind: LedgerKind; _sum: { amount: Prisma.Decimal | null } }>) => {
      const m: Record<string, number> = {};
      for (const r of rows) m[r.kind] = num(r._sum.amount);
      return m;
    };
    const allTime = foldKinds(plAllTime);
    const today = foldKinds(plToday);
    const rangeKinds = foldKinds(plRange);

    // Operator P/L = negation of net player balance delta across the PL kinds.
    const operatorPL = (m: Record<string, number>) =>
      round2(-PL_KINDS.reduce((s, k) => s + (m[k] ?? 0), 0));
    const gameRevenue = round2(-CASINO_PL_KINDS.reduce((s, k) => s + (allTime[k] ?? 0), 0));
    const rangeCasinoPL = round2(-CASINO_PL_KINDS.reduce((s, k) => s + (rangeKinds[k] ?? 0), 0));
    const rangeSportsPL = round2(-SPORTS_PL_KINDS.reduce((s, k) => s + (rangeKinds[k] ?? 0), 0));

    // ── Casino P/L by game (from ledger refType, e.g. "mines_bet"/"dice_win") ──
    const gameMap = new Map<string, { pl: number; wagered: number; bets: number }>();
    for (const r of casinoByGameRows) {
      const game = (r.refType ?? "other").replace(/_(bet|win|refund|cashout)s?$/i, "").replace(/_/g, " ");
      const g = gameMap.get(game) ?? { pl: 0, wagered: 0, bets: 0 };
      const amt = num(r._sum.amount);
      g.pl -= amt;
      if (r.kind === "CASINO_BET") { g.wagered += Math.abs(amt); g.bets += r._count as number; }
      gameMap.set(game, g);
    }
    const casinoByGame = [...gameMap.entries()]
      .map(([game, g]) => ({ game, pl: round2(g.pl), wagered: round2(g.wagered), bets: g.bets }))
      .sort((a, b) => b.wagered - a.wagered)
      .slice(0, 12);

    // ── Fill chart buckets ──
    const revenueB   = new Array(bucketCount).fill(0);
    const betSportsB = new Array(bucketCount).fill(0);
    const betCasinoB = new Array(bucketCount).fill(0);
    const growthB    = new Array(bucketCount).fill(0);
    const depB       = new Array(bucketCount).fill(0);
    const wdB        = new Array(bucketCount).fill(0);

    for (const e of recentLedger) {
      const i = idxOf(e.createdAt);
      if (i < 0) continue;
      revenueB[i] -= num(e.amount);            // operator PL per entry = -player delta
      if (e.kind === "CASINO_BET") betCasinoB[i] += 1;
    }
    for (const b of recentBets) { const i = idxOf(b.createdAt); if (i >= 0) betSportsB[i] += 1; }
    for (const u of recentUsers) { const i = idxOf(u.createdAt); if (i >= 0) growthB[i] += 1; }
    for (const t of recentTx) {
      const i = idxOf(t.createdAt);
      if (i < 0) continue;
      if (t.kind === "DEPOSIT") depB[i] += num(t.amount);
      else wdB[i] += num(t.amount);
    }

    const rangeDeposits = round2(num(depositAggR._sum.amount));
    const rangeWithdrawals = round2(num(withdrawalAggR._sum.amount));

    return {
      // ── Range echo + bucket info ──
      range: hasRange ? { from: rangeFrom?.toISOString() ?? null, to: rangeTo?.toISOString() ?? null } : null,
      bucket,

      // ── Range-scoped stats (all-time when no range selected) ──
      rangeStats: {
        pl: operatorPL(rangeKinds),
        casinoPL: rangeCasinoPL,
        sportsPL: rangeSportsPL,
        deposits: rangeDeposits,
        depositCount: depositAggR._count as number,
        avgDeposit: (depositAggR._count as number) > 0 ? round2(rangeDeposits / (depositAggR._count as number)) : 0,
        withdrawals: rangeWithdrawals,
        withdrawalCount: withdrawalAggR._count as number,
        netCashflow: round2(rangeDeposits - rangeWithdrawals),
        newUsers: newUsersRange,
        sportsBets: sportsBetsRange,
        casinoBets: casinoBetsRange,
        referralPaid: round2(num(referralPaidRange._sum.amount)),
      },
      casinoByGame,

      ...{
      // ── Headline counts ──
      users,
      onlineUsers,
      activeUsers24h,
      newRegistrationsToday,
      openBets,
      activeMarkets,
      pendingDeposits,
      pendingWithdrawals,
      pendingWithdrawalAmount: round2(num(pendingWithdrawalAgg._sum.amount)),

      // ── Money ──
      totalDeposits:  round2(num(depositAgg._sum.amount)),
      totalWithdrawals: round2(num(withdrawalAgg._sum.amount)),
      totalProfit: operatorPL(allTime),
      todayPL: operatorPL(today),
      gameRevenue,
      affiliateRevenue: round2(Math.abs(num(commissionAgg._sum.amount))),
      totalBalance:  round2(num(totals._sum.balance)),
      totalExposure: round2(num(totals._sum.exposure)),

      // ── Bets ──
      totalBets: sportsBetsCount + casinoBetCount,
      betsWon: sportsWon + casinoWinCount,
      betsLost: sportsLost + Math.max(0, casinoBetCount - casinoWinCount),

      // ── Charts (bucketed by hour/day/week to fit the selected range) ──
      revenueSeries:  buckets.map((b, i) => ({ date: b.date, label: b.label, pl: round2(revenueB[i]) })),
      betActivitySeries: buckets.map((b, i) => ({ date: b.date, label: b.label, sports: betSportsB[i], casino: betCasinoB[i], total: betSportsB[i] + betCasinoB[i] })),
      userGrowthSeries: buckets.map((b, i) => ({ date: b.date, label: b.label, count: growthB[i] })),
      depositWithdrawalSeries: buckets.map((b, i) => ({ date: b.date, label: b.label, deposits: round2(depB[i]), withdrawals: round2(wdB[i]) })),

      // ── Back-compat: existing 7-day P/L slice ──
      pl7d: buckets.slice(-7).map((b, i0) => { const i = bucketCount - Math.min(7, bucketCount) + i0; return { date: b.date, pl: round2(revenueB[i]) }; }),
      },
    };
  }

  // ── Exposure management ─────────────────────────────────────────────────────
  // Markets whose liability is still real: anything not yet SETTLED/VOID.
  private static readonly UNSETTLED_MARKETS: MarketStatus[] = [
    MarketStatus.OPEN, MarketStatus.SUSPENDED, MarketStatus.CLOSED,
  ];

  /**
   * Every wallet holding exposure, with the LIVE exposure it should hold
   * (sum of MarketExposure.worstCase over unsettled markets). The difference
   * is leaked (orphaned by deleted/settled markets) or corrupt (negative) and
   * can be reconciled.
   */
  async exposureOverview() {
    const wallets = await this.prisma.wallet.findMany({
      where: { NOT: { exposure: 0 } },
      include: { user: { select: { id: true, username: true, role: true, status: true, lastLoginAt: true } } },
      orderBy: { exposure: "desc" },
    });
    const ids = wallets.map((w) => w.userId);
    const [liveRows, betAgg] = await Promise.all([
      ids.length
        ? this.prisma.marketExposure.findMany({
            where: { userId: { in: ids }, market: { status: { in: AdminService.UNSETTLED_MARKETS } } },
            select: { userId: true, worstCase: true },
          })
        : Promise.resolve([] as Array<{ userId: string; worstCase: Prisma.Decimal }>),
      ids.length
        ? this.prisma.bet.groupBy({
            by: ["userId"],
            _count: { _all: true },
            _sum: { liability: true },
            where: { userId: { in: ids }, status: { in: [BetStatus.OPEN, BetStatus.MATCHED] } },
          })
        : Promise.resolve([] as any[]),
    ]);

    const num = (d: Prisma.Decimal | null | undefined) => Number((d ?? new Prisma.Decimal(0)).toString());
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const liveMap = new Map<string, number>();
    for (const r of liveRows) liveMap.set(r.userId, (liveMap.get(r.userId) ?? 0) + num(r.worstCase));
    const betMap = new Map<string, { count: number; liability: number }>();
    for (const b of betAgg) betMap.set(b.userId, { count: b._count._all as number, liability: num(b._sum.liability) });

    const rows = wallets.map((w) => {
      const exposure = round2(num(w.exposure));
      const live = round2(liveMap.get(w.userId) ?? 0);
      return {
        userId: w.userId,
        username: w.user.username,
        role: w.user.role,
        userStatus: w.user.status,
        lastLoginAt: w.user.lastLoginAt,
        balance: round2(num(w.balance)),
        exposure,
        liveExposure: live,
        mismatch: round2(exposure - live),
        available: round2(num(w.balance) - exposure),
        openBets: betMap.get(w.userId)?.count ?? 0,
        openLiability: round2(betMap.get(w.userId)?.liability ?? 0),
      };
    });

    const leakedRows = rows.filter((r) => r.mismatch > 0.009);
    return {
      summary: {
        wallets: rows.length,
        totalExposure: Math.round(rows.reduce((s, r) => s + r.exposure, 0) * 100) / 100,
        liveExposure: Math.round(rows.reduce((s, r) => s + r.liveExposure, 0) * 100) / 100,
        leaked: Math.round(leakedRows.reduce((s, r) => s + r.mismatch, 0) * 100) / 100,
        leakedWallets: leakedRows.length,
        negativeWallets: rows.filter((r) => r.exposure < 0).length,
        openBets: rows.reduce((s, r) => s + r.openBets, 0),
      },
      rows,
    };
  }

  /** Full exposure breakdown for one user: markets holding it + open bets. */
  async exposureDetail(userId: string) {
    const [user, wallet, markets, bets] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, role: true, status: true, createdAt: true, lastLoginAt: true },
      }),
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.marketExposure.findMany({
        where: { userId },
        include: { market: { select: { id: true, name: true, status: true } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      this.prisma.bet.findMany({
        where: { userId, status: { in: [BetStatus.OPEN, BetStatus.MATCHED] } },
        include: { market: { select: { name: true, status: true } }, runner: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);
    if (!user) throw new BadRequestException("User not found");

    const num = (d: Prisma.Decimal | null | undefined) => Number((d ?? new Prisma.Decimal(0)).toString());
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const exposure = round2(num(wallet?.exposure));
    const balance = round2(num(wallet?.balance));
    const live = round2(
      markets
        .filter((m) => AdminService.UNSETTLED_MARKETS.includes(m.market.status))
        .reduce((s, m) => s + num(m.worstCase), 0),
    );

    return {
      user,
      wallet: { balance, exposure, available: round2(balance - exposure) },
      liveExposure: live,
      mismatch: round2(exposure - live),
      markets: markets.map((m) => ({
        marketId: m.market.id,
        name: m.market.name,
        status: m.market.status,
        live: AdminService.UNSETTLED_MARKETS.includes(m.market.status),
        worstCase: round2(num(m.worstCase)),
        updatedAt: m.updatedAt,
      })),
      openBets: bets.map((b) => ({
        id: b.id,
        market: b.market.name,
        marketStatus: b.market.status,
        runner: b.runner.name,
        side: b.side,
        odds: Number(b.odds),
        stake: round2(num(b.stake)),
        liability: round2(num(b.liability)),
        potentialProfit: round2(num(b.potentialProfit)),
        createdAt: b.createdAt,
      })),
    };
  }

  /** What a reconcile would change for this wallet (current vs live exposure). */
  async exposureFix(userId: string) {
    const [wallet, liveRows] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.marketExposure.findMany({
        where: { userId, market: { status: { in: AdminService.UNSETTLED_MARKETS } } },
        select: { worstCase: true },
      }),
    ]);
    if (!wallet) throw new BadRequestException("Wallet not found");
    const num = (d: Prisma.Decimal) => Number(d.toString());
    const current = Math.round(num(wallet.exposure) * 100) / 100;
    const live = Math.round(liveRows.reduce((s, r) => s + num(r.worstCase), 0) * 100) / 100;
    return { current, live, delta: Math.round((live - current) * 100) / 100 };
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
    since.setUTCHours(0, 0, 0, 0);

    // Sports AND casino — the old report only read the sports bet table, so a
    // casino-heavy platform showed all zeros.
    const PL_KINDS: LedgerKind[] = [
      LedgerKind.BET_SETTLE_WIN, LedgerKind.BET_SETTLE_LOSS,
      LedgerKind.CASINO_BET, LedgerKind.CASINO_WIN, LedgerKind.CASINO_REFUND,
    ];

    const [
      sportsBets, casinoBets, openSportsBets, settledBets, ledger,
      mInP, tInP, cInP, cfInP, pumpActive,
    ] = await Promise.all([
      this.prisma.bet.count({ where: { createdAt: { gte: since } } }),
      this.prisma.ledgerEntry.count({ where: { kind: "CASINO_BET", createdAt: { gte: since } } }),
      this.prisma.bet.count({ where: { status: { in: [BetStatus.OPEN, BetStatus.MATCHED] } } }),
      this.prisma.bet.count({ where: { status: { in: [BetStatus.SETTLED_WON, BetStatus.SETTLED_LOST] }, createdAt: { gte: since } } }),
      this.prisma.ledgerEntry.findMany({
        where: { kind: { in: PL_KINDS }, createdAt: { gte: since } },
        select: { amount: true, kind: true, createdAt: true },
      }),
      this.prisma.minesSession.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.towersSession.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.chickenRoadSession.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.coinflipSession.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.pumpBet.count({ where: { status: "ACTIVE" } }),
    ]);

    // Daily buckets, zero-filled across the whole window so the chart axis
    // has no gaps on inactive days.
    const daily: Record<string, { volume: number; pl: number }> = {};
    for (let t = since.getTime(); t <= Date.now(); t += 86_400_000) {
      daily[new Date(t).toISOString().slice(0, 10)] = { volume: 0, pl: 0 };
    }
    let totalWin = 0;
    let totalPL = 0;
    for (const e of ledger) {
      const day = e.createdAt.toISOString().slice(0, 10);
      const d = daily[day] ?? (daily[day] = { volume: 0, pl: 0 });
      const amt = Number(e.amount.toString());
      // wagered/turnover: casino stakes + sports settlement legs
      if (e.kind === "CASINO_BET" || e.kind === "BET_SETTLE_WIN" || e.kind === "BET_SETTLE_LOSS") {
        d.volume += Math.abs(amt);
      }
      // operator P/L per entry = -(player balance delta) for every PL kind
      d.pl -= amt;
      totalPL -= amt;
      if (e.kind === "BET_SETTLE_WIN" || e.kind === "CASINO_WIN") totalWin += amt;
    }

    const series = Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, volume: Math.round(d.volume * 100) / 100, pl: Math.round(d.pl * 100) / 100 }));

    return {
      days,
      totalBets: sportsBets + casinoBets,
      sportsBets,
      casinoBets,
      openBets: openSportsBets + mInP + tInP + cInP + cfInP + pumpActive,
      settledBets,
      totalUserWin: Math.round(totalWin * 100) / 100,
      totalOperatorPL: Math.round(totalPL * 100) / 100,
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

  // ── P/L Control: per-game win/loss & difficulty config + live P/L ──────────
  async getPlControl() {
    const s = (await this.getPlatformSettings()) as Record<string, unknown>;
    const [plinkoRow, pumpRow, rouletteRow] = await Promise.all([
      this.prisma.systemConfig.findUnique({ where: { key: "plinko_config" } }),
      this.prisma.systemConfig.findUnique({ where: { key: "pump_config" } }),
      this.prisma.systemConfig.findUnique({ where: { key: "roulette_config" } }),
    ]);
    const plinkoCfg = (plinkoRow?.value as Record<string, unknown>) ?? {};
    const pumpCfg = (pumpRow?.value as Record<string, unknown>) ?? {};
    const rouletteCfg = (rouletteRow?.value as Record<string, unknown>) ?? {};
    const n = (v: unknown, d = 0) => (v == null ? d : Number(v));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stat = async (model: any, where: any, winWhere: any, amountField = "betAmount") => {
      const sumSel: Record<string, boolean> = { payout: true, [amountField]: true };
      const [agg, wins] = await Promise.all([
        model.aggregate({ _sum: sumSel, _count: true, where }),
        model.count({ where: { ...where, ...winWhere } }),
      ]);
      const wagered = n(agg._sum[amountField]);
      const payout = n(agg._sum.payout);
      const bets = agg._count as number;
      return { wagered, payout, pl: +(wagered - payout).toFixed(2), bets, wins, winRate: bets ? +((wins / bets) * 100).toFixed(1) : 0 };
    };

    const p = this.prisma;
    const [dice, mines, towers, chicken, coinflip, plinko, pump, roulette] = await Promise.all([
      stat(p.diceBet, {}, { won: true }),
      stat(p.minesSession, { status: { not: "IN_PROGRESS" } }, { status: "CASHED_OUT" }),
      stat(p.towersSession, { status: { not: "IN_PROGRESS" } }, { status: "CASHED_OUT" }),
      stat(p.chickenRoadSession, { status: { not: "IN_PROGRESS" } }, { status: "CASHED_OUT" }),
      stat(p.coinflipSession, { status: { not: "IN_PROGRESS" } }, { status: "CASHED_OUT" }),
      stat(p.plinkoBet, {}, { profit: { gte: 0 } }),
      stat(p.pumpBet, { status: { not: "ACTIVE" } }, { status: "CASHED" }),
      stat(p.rouletteBet, { settledAt: { not: null } }, { isWin: true }, "amount"),
    ]);

    const games = [
      { id: "dice", name: "Dice", emoji: "🎲", controlType: "edge", target: "platform",
        config: { houseEdge: n(s.diceHouseEdge, 0.01), minBet: n(s.diceMinBet, 10), maxBet: n(s.diceMaxBet, 1_000_000), enabled: s.diceEnabled !== false },
        keys: { houseEdge: "diceHouseEdge", minBet: "diceMinBet", maxBet: "diceMaxBet", enabled: "diceEnabled" }, stats: dice },
      { id: "mines", name: "Mines", emoji: "💣", controlType: "edge", target: "platform", hasHardness: true,
        config: { houseEdge: n(s.minesHouseEdge, 0.01), hardness: n(s.minesHardness, 0), minBet: n(s.minesMinBet, 10), maxBet: n(s.minesMaxBet, 100_000), enabled: s.minesEnabled !== false },
        keys: { houseEdge: "minesHouseEdge", hardness: "minesHardness", minBet: "minesMinBet", maxBet: "minesMaxBet", enabled: "minesEnabled" }, stats: mines },
      { id: "towers", name: "Towers", emoji: "🗼", controlType: "edge", target: "platform",
        config: { houseEdge: n(s.towersHouseEdge, 0.02), minBet: n(s.towersMinBet, 10), maxBet: n(s.towersMaxBet, 100_000), enabled: s.towersEnabled !== false },
        keys: { houseEdge: "towersHouseEdge", minBet: "towersMinBet", maxBet: "towersMaxBet", enabled: "towersEnabled" }, stats: towers },
      { id: "chicken-road", name: "Chicken Road", emoji: "🐔", controlType: "edge", target: "platform",
        config: { houseEdge: n(s.chickenRoadHouseEdge, 0.03), minBet: n(s.chickenRoadMinBet, 10), maxBet: n(s.chickenRoadMaxBet, 100_000), enabled: s.chickenRoadEnabled !== false },
        keys: { houseEdge: "chickenRoadHouseEdge", minBet: "chickenRoadMinBet", maxBet: "chickenRoadMaxBet", enabled: "chickenRoadEnabled" }, stats: chicken },
      { id: "coinflip", name: "Coinflip", emoji: "🪙", controlType: "edge", target: "platform",
        config: { houseEdge: n(s.coinflipHouseEdge, 0.01), minBet: n(s.coinflipMinBet, 10), maxBet: n(s.coinflipMaxBet, 100_000), enabled: s.coinflipEnabled !== false },
        keys: { houseEdge: "coinflipHouseEdge", minBet: "coinflipMinBet", maxBet: "coinflipMaxBet", enabled: "coinflipEnabled" }, stats: coinflip },
      { id: "plinko", name: "Plinko", emoji: "🔻", controlType: "rtp", target: "endpoint", endpoint: "/plinko/admin/config",
        config: { rtpPercent: n(plinkoCfg.rtpPercent, 97), maxPayout: n(plinkoCfg.maxPayout, 1000), minBet: n(plinkoCfg.minBet, 10), maxBet: n(plinkoCfg.maxBet, 100_000), enabled: plinkoCfg.enabled !== false }, stats: plinko },
      { id: "pump", name: "Pump", emoji: "🎈", controlType: "rtp", target: "endpoint", endpoint: "/casino/pump/admin/config", hasForce: true,
        config: { rtpPercent: n(pumpCfg.rtpPercent, 97), maxPayout: n(pumpCfg.maxPayout, 1000), minBet: n(pumpCfg.minBet, 10), maxBet: n(pumpCfg.maxBet, 100_000), enabled: pumpCfg.enabled !== false }, stats: pump },
      { id: "roulette", name: "Roulette", emoji: "🎡", controlType: "rtp", target: "endpoint", endpoint: "/roulette/admin/config", hasForceNumber: true,
        config: {
          rtpPercent: n(rouletteCfg.rtpPercent, 97), maxPayout: n(rouletteCfg.maxPayout, 0),
          minBet: n(rouletteCfg.minBet, 10), maxBet: n(rouletteCfg.maxBet, 100_000),
          enabled: rouletteCfg.enabled !== false,
          forceNumber: (Number.isInteger(Number(rouletteCfg.forceNumber)) && Number(rouletteCfg.forceNumber) >= 0 && Number(rouletteCfg.forceNumber) <= 36) ? Number(rouletteCfg.forceNumber) : null,
        }, stats: roulette },
    ];

    const sum = (k: "wagered" | "payout" | "pl" | "bets") => games.reduce((a, g) => a + ((g.stats as Record<string, number>)[k] ?? 0), 0);
    return { games, summary: { wagered: sum("wagered"), payout: sum("payout"), pl: +sum("pl").toFixed(2), bets: sum("bets") } };
  }

  async getPlatformSettings() {
    // Read from Redis cache first — settings change infrequently but are read on every page load.
    // Cache hit = ~0.2ms vs ~3-5ms for a PG roundtrip. Multiplied across all SSR + client requests this is huge.
    const cached = await this.redis.client.get(PLATFORM_SETTINGS_CACHE_KEY).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    const row = await this.prisma.systemConfig.findUnique({ where: { key: "platform" } });
    const defaults = {
      minStake: 100, maxStake: 100000, maxMarketExposure: 1000000,
      defaultPartnershipBps: 0, currency: "INR",
      maintenanceMode: false, registrationEnabled: true,
      depositEnabled: true, withdrawalEnabled: true,
      minWithdrawal: 100, maxWithdrawal: 500000,
    };
    const merged = row ? { ...defaults, ...(row.value as object) } : defaults;
    // Best-effort cache write; ignore errors so Redis outages don't break the API.
    this.redis.client.set(PLATFORM_SETTINGS_CACHE_KEY, JSON.stringify(merged), "EX", PLATFORM_SETTINGS_CACHE_TTL).catch(() => {});
    return merged;
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

    // Invalidate cache so the next read picks up fresh values.
    await this.redis.client.del(PLATFORM_SETTINGS_CACHE_KEY).catch(() => {});
    return this.getPlatformSettings();
  }

  // ── User Profile ───────────────────────────────────────────────────────────

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true, limits: true, referredBy: { select: { id: true, username: true } } },
    });
    if (!user) throw new BadRequestException("User not found");

    const [
      ledgerGroups, betGroups, minesAgg, minesGroups, recentLogins, recentTxns, recentBets, adminNotes, payoutMethods,
      ledgerRows, exposureMoves, marketExposures, casinoGameRows, referredUsers, referralEarnedAgg,
    ] =
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
        this.prisma.userPayoutMethod.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        // ── Wallet ledger (every balance movement) ──
        this.prisma.ledgerEntry.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, kind: true, amount: true, balanceAfter: true, exposureDelta: true, exposureAfter: true, refType: true, note: true, createdAt: true },
        }),
        // ── Exposure movement history (locks & releases) ──
        this.prisma.ledgerEntry.findMany({
          where: { userId, NOT: { exposureDelta: 0 } },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: { id: true, kind: true, exposureDelta: true, exposureAfter: true, refType: true, note: true, createdAt: true },
        }),
        // ── Current exposure breakdown by market ──
        this.prisma.marketExposure.findMany({
          where: { userId },
          include: { market: { select: { id: true, name: true, status: true } } },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
        // ── Casino activity per game (from ledger refType) ──
        this.prisma.ledgerEntry.groupBy({
          by: ["refType", "kind"],
          _sum: { amount: true },
          _count: true,
          where: { userId, kind: { in: [LedgerKind.CASINO_BET, LedgerKind.CASINO_WIN, LedgerKind.CASINO_REFUND] } },
        }),
        // ── Referrals ──
        this.prisma.user.findMany({
          where: { referredById: userId },
          select: { id: true, username: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        this.prisma.ledgerEntry.aggregate({
          _sum: { amount: true },
          where: { userId, kind: LedgerKind.COMMISSION_PAYOUT, refType: "referral", amount: { gt: 0 } },
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
        withdrawalsFrozen: user.withdrawalsFrozen,
        flaggedSuspicious: user.flaggedSuspicious,
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
      vip: (() => {
        // Level derived from total deposits (DEPOSIT + ADMIN_CREDIT) — same as web.
        const dep = Math.max(0, lm["DEPOSIT"] ?? 0) + Math.max(0, lm["ADMIN_CREDIT"] ?? 0);
        const lvl = levelFromDeposits(dep);
        const next = lvl.max === Infinity ? null : lvl.max;
        return {
          name: lvl.name, tier: lvl.tier, color: lvl.color,
          cashbackBps: lvl.cashback * 100, minWagered: lvl.min,
          totalDeposited: dep, nextThreshold: next,
          toNext: next ? Math.max(0, next - dep) : 0,
          perks: lvl.perks,
        };
      })(),
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
      payoutMethods,

      // ── Wallet ledger (full money trail) ──
      ledger: ledgerRows.map((l) => ({
        id: l.id, kind: l.kind, amount: Number(l.amount), balanceAfter: Number(l.balanceAfter),
        exposureDelta: Number(l.exposureDelta), exposureAfter: Number(l.exposureAfter),
        refType: l.refType, note: l.note, createdAt: l.createdAt,
      })),

      // ── Exposure: live breakdown + movement history ──
      exposure: (() => {
        const UNSETTLED = AdminService.UNSETTLED_MARKETS;
        const markets = marketExposures.map((m) => ({
          marketId: m.market.id, name: m.market.name, status: m.market.status,
          live: UNSETTLED.includes(m.market.status), worstCase: Number(m.worstCase), updatedAt: m.updatedAt,
        }));
        const live = Math.round(markets.filter((m) => m.live).reduce((s, m) => s + m.worstCase, 0) * 100) / 100;
        const current = Number(user.wallet?.exposure ?? 0);
        return {
          current: Math.round(current * 100) / 100,
          live,
          mismatch: Math.round((current - live) * 100) / 100,
          markets,
          moves: exposureMoves.map((m) => ({
            id: m.id, kind: m.kind, delta: Number(m.exposureDelta), after: Number(m.exposureAfter),
            refType: m.refType, note: m.note, createdAt: m.createdAt,
          })),
        };
      })(),

      // ── Casino per-game breakdown ──
      casinoByGame: (() => {
        const map = new Map<string, { wagered: number; payout: number; bets: number }>();
        for (const r of casinoGameRows) {
          const game = (r.refType ?? "other").replace(/_(bet|win|refund|cashout)s?$/i, "").replace(/_/g, " ");
          const g = map.get(game) ?? { wagered: 0, payout: 0, bets: 0 };
          const amt = Number(r._sum.amount ?? 0);
          if (r.kind === "CASINO_BET") { g.wagered += Math.abs(amt); g.bets += r._count as number; }
          else g.payout += Math.max(0, amt);
          map.set(game, g);
        }
        return [...map.entries()]
          .map(([game, g]) => ({
            game,
            bets: g.bets,
            wagered: Math.round(g.wagered * 100) / 100,
            payout: Math.round(g.payout * 100) / 100,
            net: Math.round((g.payout - g.wagered) * 100) / 100, // player P/L (negative = house won)
          }))
          .sort((a, b) => b.wagered - a.wagered);
      })(),

      // ── Referral ──
      referral: {
        code: `${user.username.toUpperCase().slice(0, 6)}${user.id.slice(-4)}`,
        referredBy: user.referredBy ? { id: user.referredBy.id, username: user.referredBy.username } : null,
        count: referredUsers.length,
        earned: Math.round(Number(referralEarnedAgg._sum.amount ?? 0) * 100) / 100,
        users: referredUsers,
      },
    };
  }

  /** Freeze controls: toggle withdrawal freeze / suspicious flag on a user. */
  async setUserFlags(actorId: string, targetUserId: string, patch: { withdrawalsFrozen?: boolean; flaggedSuspicious?: boolean }, ip?: string) {
    const data: Prisma.UserUpdateInput = {};
    if (patch.withdrawalsFrozen !== undefined) data.withdrawalsFrozen = patch.withdrawalsFrozen;
    if (patch.flaggedSuspicious !== undefined) data.flaggedSuspicious = patch.flaggedSuspicious;
    const u = await this.prisma.user.update({
      where: { id: targetUserId }, data,
      select: { id: true, withdrawalsFrozen: true, flaggedSuspicious: true },
    });
    await this.writeAudit(actorId, "user.flags", { type: "user", id: targetUserId }, patch, ip);
    return u;
  }

  /** Delete a single market (and its runners, bets, exposure rows). */
  /**
   * Release the wallet exposure reserved against OPEN bets on the given markets
   * BEFORE those bets are deleted — otherwise the liability stays locked in
   * wallet.exposure forever (a leak that shrinks the player's available balance).
   */
  private async releaseOpenExposure(marketIds: string[]) {
    if (!marketIds.length) return;
    const openBets = await this.prisma.bet.findMany({
      where: { marketId: { in: marketIds }, status: BetStatus.OPEN },
      select: { userId: true, liability: true },
    });
    if (!openBets.length) return;
    const byUser = new Map<string, number>();
    for (const b of openBets) byUser.set(b.userId, (byUser.get(b.userId) ?? 0) + Number(b.liability));
    for (const [userId, rel] of byUser) {
      if (rel <= 0) continue;
      const w = await this.prisma.wallet.findUnique({ where: { userId } });
      if (!w) continue;
      const newExp = Math.max(0, Math.round((Number(w.exposure) - rel) * 10000) / 10000);
      await this.prisma.$transaction([
        this.prisma.ledgerEntry.create({ data: {
          userId, kind: LedgerKind.BET_VOID, amount: 0, exposureDelta: -(Number(w.exposure) - newExp),
          balanceAfter: Number(w.balance), exposureAfter: newExp,
          refType: "market_delete", note: "Exposure released — open bets removed by admin market/match delete",
        } }),
        this.prisma.wallet.update({ where: { userId }, data: { exposure: newExp, version: { increment: 1 } } }),
      ]);
    }
  }

  async deleteMarket(id: string) {
    const m = await this.prisma.market.findUnique({ where: { id } });
    if (!m) throw new BadRequestException("Market not found");
    await this.releaseOpenExposure([id]);
    await this.prisma.$transaction([
      this.prisma.bet.deleteMany({ where: { marketId: id } }),
      this.prisma.marketExposure.deleteMany({ where: { marketId: id } }),
      this.prisma.market.delete({ where: { id } }), // runners cascade
    ]);
    return { ok: true };
  }

  /** Delete a whole match (all its markets, runners, bets, exposure rows). */
  async deleteMatch(id: string) {
    const match = await this.prisma.match.findUnique({ where: { id } });
    if (!match) throw new BadRequestException("Match not found");
    const marketIds = (await this.prisma.market.findMany({ where: { matchId: id }, select: { id: true } })).map((x) => x.id);
    await this.releaseOpenExposure(marketIds);
    await this.prisma.$transaction([
      this.prisma.bet.deleteMany({ where: { marketId: { in: marketIds } } }),
      this.prisma.marketExposure.deleteMany({ where: { marketId: { in: marketIds } } }),
      this.prisma.match.delete({ where: { id } }), // markets + runners cascade
    ]);
    return { ok: true };
  }

  async addUserNote(actorId: string, targetUserId: string, note: string) {
    await this.writeAudit(actorId, "admin.note", { type: "user", id: targetUserId }, { note });
    return { ok: true };
  }

  // ── Provably Fair ───────────────────────────────────────────────────────────
  /** Seed records across all in-house games. The server seed is only exposed once
   *  a round has settled (live rounds keep it hidden — only the hash is published). */
  async listProvablyFair(opts: { game?: string; username?: string; limit?: number } = {}) {
    const take = Math.min(opts.limit ?? 60, 200);
    const userFilter = opts.username
      ? { user: { username: { contains: opts.username, mode: "insensitive" as const } } }
      : {};
    const g = opts.game;
    const withUser = { user: { select: { username: true } } };
    const seedSel = { id: true, serverSeed: true, serverSeedHash: true, clientSeed: true, nonce: true, createdAt: true, ...withUser };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [mines, plinko, pump, dice, towers, chicken] = await Promise.all([
      (!g || g === "mines")        ? this.prisma.minesSession.findMany({ where: userFilter, orderBy: { createdAt: "desc" }, take, select: { ...seedSel, status: true } }) : [],
      (!g || g === "plinko")       ? this.prisma.plinkoBet.findMany({ where: userFilter, orderBy: { createdAt: "desc" }, take, select: seedSel }) : [],
      (!g || g === "pump")         ? this.prisma.pumpBet.findMany({ where: userFilter, orderBy: { createdAt: "desc" }, take, select: { ...seedSel, status: true } }) : [],
      (!g || g === "dice")         ? this.prisma.diceBet.findMany({ where: userFilter, orderBy: { createdAt: "desc" }, take, select: seedSel }) : [],
      (!g || g === "towers")       ? this.prisma.towersSession.findMany({ where: userFilter, orderBy: { createdAt: "desc" }, take, select: { ...seedSel, status: true } }) : [],
      (!g || g === "chicken-road") ? this.prisma.chickenRoadSession.findMany({ where: userFilter, orderBy: { createdAt: "desc" }, take, select: { ...seedSel, status: true } }) : [],
    ]);

    const map = (rows: any[], game: string) => rows.map((r) => {
      const live = r.status === "IN_PROGRESS" || r.status === "ACTIVE";
      return {
        id: r.id, game, username: r.user?.username ?? "—",
        serverSeed: live ? null : r.serverSeed,   // unrevealed while the round is live
        serverSeedHash: r.serverSeedHash, clientSeed: r.clientSeed, nonce: r.nonce,
        status: r.status ?? "SETTLED", createdAt: r.createdAt,
      };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const all = [
      ...map(mines, "mines"), ...map(plinko, "plinko"), ...map(pump, "pump"),
      ...map(dice, "dice"), ...map(towers, "towers"), ...map(chicken, "chicken-road"),
    ];
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return all.slice(0, take);
  }

  // ── Real-time Monitoring ─────────────────────────────────────────────────────
  async getMonitoring() {
    const now = Date.now();
    const online5 = new Date(now - 5 * 60_000);
    const lastHour = new Date(now - 60 * 60_000);

    const dbStart = Date.now();
    const [
      onlineUsers, openBets,
      minesActive, towersActive, chickenActive, pumpActive,
      depHour, wdHour, bigWins,
    ] = await Promise.all([
      this.prisma.user.count({ where: { lastLoginAt: { gte: online5 } } }),
      this.prisma.bet.count({ where: { status: "OPEN" } }),
      this.prisma.minesSession.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.towersSession.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.chickenRoadSession.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.pumpBet.count({ where: { status: "ACTIVE" } }),
      this.prisma.transaction.aggregate({ _count: { _all: true }, _sum: { amount: true }, where: { kind: "DEPOSIT", createdAt: { gte: lastHour } } }),
      this.prisma.transaction.aggregate({ _count: { _all: true }, _sum: { amount: true }, where: { kind: "WITHDRAWAL", createdAt: { gte: lastHour } } }),
      this.prisma.ledgerEntry.findMany({ where: { kind: "CASINO_WIN", amount: { gt: 0 }, createdAt: { gte: lastHour } }, orderBy: { amount: "desc" }, take: 8, include: { user: { select: { username: true } } } }),
    ]);
    const dbLatencyMs = Date.now() - dbStart;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const load = os.loadavg();
    const cpuCount = os.cpus().length || 1;
    const mem = process.memoryUsage();

    return {
      online: {
        users: onlineUsers,
        openBets,
        activeSessions: minesActive + towersActive + chickenActive + pumpActive,
        sessionsByGame: { mines: minesActive, towers: towersActive, "chicken-road": chickenActive, pump: pumpActive },
      },
      flow: {
        depositsHour:    { count: depHour._count._all, amount: Number(depHour._sum.amount ?? 0) },
        withdrawalsHour: { count: wdHour._count._all,  amount: Number(wdHour._sum.amount ?? 0) },
      },
      bigWins: bigWins.map((w) => ({ username: w.user?.username ?? "—", amount: Number(w.amount.toString()), at: w.createdAt })),
      system: {
        cpuCount,
        load1: Math.round(load[0] * 100) / 100,
        loadPct: Math.min(100, Math.round((load[0] / cpuCount) * 100)),
        memTotalMB: Math.round(totalMem / 1048576),
        memUsedMB: Math.round((totalMem - freeMem) / 1048576),
        memUsedPct: Math.round(((totalMem - freeMem) / totalMem) * 100),
        heapUsedMB: Math.round(mem.heapUsed / 1048576),
        rssMB: Math.round(mem.rss / 1048576),
        uptimeSec: Math.round(process.uptime()),
        dbLatencyMs,
      },
    };
  }

  // ── Affiliates / Referrals ────────────────────────────────────────────────────
  async listAffiliates(opts: { limit?: number } = {}) {
    const take = Math.min(opts.limit ?? 100, 500);
    // An affiliate is any user with hierarchy children (agents/bookies) OR
    // player referrals from the Refer & Earn programme.
    const agents = await this.prisma.user.findMany({
      where: { OR: [{ children: { some: {} } }, { referredUsers: { some: {} } }] },
      take,
      select: {
        id: true, username: true, role: true, partnershipBps: true, createdAt: true,
        _count: { select: { children: true, referredUsers: true } },
      },
    });
    const ids = agents.map((a) => a.id);
    // Only referral commission credits — bookie/agent collection transfers
    // (refType "commission") are internal money movement, not affiliate earnings.
    const commissions = ids.length
      ? await this.prisma.ledgerEntry.groupBy({
          by: ["userId"],
          where: { userId: { in: ids }, kind: "COMMISSION_PAYOUT", refType: "referral", amount: { gt: 0 } },
          _sum: { amount: true },
        })
      : [];
    const cm: Record<string, number> = {};
    for (const c of commissions) cm[c.userId] = Math.abs(Number((c._sum.amount ?? new Prisma.Decimal(0)).toString()));

    const totalReferrals = agents.reduce((s, a) => s + a._count.children + a._count.referredUsers, 0);
    const totalCommission = Object.values(cm).reduce((s, v) => s + v, 0);

    return {
      summary: {
        affiliates: agents.length,
        totalReferrals,
        totalCommission: Math.round(totalCommission * 100) / 100,
      },
      rows: agents
        .map((a) => ({
          id: a.id, username: a.username, role: a.role,
          referrals: a._count.children + a._count.referredUsers,
          partnershipBps: a.partnershipBps,
          commissionEarned: cm[a.id] ?? 0,
          createdAt: a.createdAt,
        }))
        .sort((x, y) => y.referrals - x.referrals),
    };
  }

  // ── Admin / Staff role management ──────────────────────────────────────────────
  listStaff() {
    return this.prisma.user.findMany({
      where: { role: { not: UserRole.USER } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, username: true, email: true, role: true, status: true, lastLoginAt: true, lastLoginIp: true, createdAt: true },
    });
  }

  async setUserRole(targetUserId: string, role: UserRole, actorRole: UserRole) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id: targetUserId }, select: { id: true, role: true } });
    // Only a Super Admin may grant or revoke the Super Admin role.
    if ((target.role === UserRole.SUPER_ADMIN || role === UserRole.SUPER_ADMIN) && actorRole !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException("Only a Super Admin can manage Super Admin roles");
    }
    return this.prisma.user.update({ where: { id: targetUserId }, data: { role }, select: { id: true, username: true, role: true } });
  }

  // ── VIP levels ─────────────────────────────────────────────────────────────────
  async listVipLevels() {
    const levels = await this.prisma.vipLevel.findMany({
      orderBy: { tier: "asc" },
      include: { _count: { select: { users: true } } },
    });
    return levels.map((l) => ({
      id: l.id, name: l.name, tier: l.tier,
      minWagered: Number(l.minWagered.toString()), cashbackBps: l.cashbackBps,
      bonusAmount: Number(l.bonusAmount.toString()), color: l.color, perks: l.perks,
      userCount: l._count.users, createdAt: l.createdAt,
    }));
  }

  createVipLevel(dto: { name: string; tier: number; minWagered?: number; cashbackBps?: number; bonusAmount?: number; color?: string; perks?: string[] }) {
    return this.prisma.vipLevel.create({
      data: {
        name: dto.name, tier: dto.tier,
        minWagered: dto.minWagered ?? 0, cashbackBps: dto.cashbackBps ?? 0,
        bonusAmount: dto.bonusAmount ?? 0, color: dto.color ?? "#fbbf24",
        perks: (dto.perks ?? []) as Prisma.InputJsonValue,
      },
    });
  }

  updateVipLevel(id: string, dto: Partial<{ name: string; tier: number; minWagered: number; cashbackBps: number; bonusAmount: number; color: string; perks: string[] }>) {
    const data: Prisma.VipLevelUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.tier !== undefined) data.tier = dto.tier;
    if (dto.minWagered !== undefined) data.minWagered = dto.minWagered;
    if (dto.cashbackBps !== undefined) data.cashbackBps = dto.cashbackBps;
    if (dto.bonusAmount !== undefined) data.bonusAmount = dto.bonusAmount;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.perks !== undefined) data.perks = dto.perks as Prisma.InputJsonValue;
    return this.prisma.vipLevel.update({ where: { id }, data });
  }

  // Optional relation → Prisma sets affected users' vipLevelId to NULL on delete.
  deleteVipLevel(id: string) {
    return this.prisma.vipLevel.delete({ where: { id } });
  }

  async assignVip(username: string, vipLevelId: string | null) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new BadRequestException("User not found");
    if (vipLevelId) {
      const exists = await this.prisma.vipLevel.findUnique({ where: { id: vipLevelId }, select: { id: true } });
      if (!exists) throw new BadRequestException("VIP level not found");
    }
    return this.prisma.user.update({ where: { id: user.id }, data: { vipLevelId }, select: { id: true, username: true, vipLevelId: true } });
  }

  /** Deposit-based VIP overview: the canonical tiers + how many players sit in each. */
  async getVipOverview() {
    const groups = await this.prisma.ledgerEntry.groupBy({
      by: ["userId"],
      where: { kind: { in: [LedgerKind.DEPOSIT, LedgerKind.ADMIN_CREDIT] }, amount: { gt: 0 } },
      _sum: { amount: true },
    });
    const counts = new Array(VIP_TIERS.length).fill(0) as number[];
    const depositors = new Set<string>();
    for (const g of groups) {
      counts[getTierIndex(Number(g._sum.amount ?? 0))]++;
      depositors.add(g.userId);
    }
    // Players with no deposits sit at Bronze by default.
    const totalPlayers = await this.prisma.user.count({ where: { role: { not: UserRole.BOOKIE } } });
    counts[0] += Math.max(0, totalPlayers - depositors.size);
    return {
      totalMembers: totalPlayers,
      tiers: VIP_TIERS.map((t, i) => ({
        name: t.name, tier: i + 1, min: t.min, max: t.max === Infinity ? null : t.max,
        color: t.color, cashback: t.cashback, perks: t.perks as readonly string[], members: counts[i],
      })),
    };
  }

  // ── Promo codes ──────────────────────────────────────────────────────────────────
  /** Active, non-expired, not-fully-used promos for the public Promotions view. */
  async listActivePromos() {
    const now = new Date();
    const rows = await this.prisma.promoCode.findMany({
      where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "desc" },
    });
    return rows
      .filter((p) => p.maxUses == null || p.usedCount < p.maxUses)
      .map((p) => ({
        code: p.code, type: p.type,
        amount: Number(p.amount.toString()), percentage: p.percentage,
        minDeposit: Number(p.minDeposit.toString()), wagerMultiplier: p.wagerMultiplier,
        expiresAt: p.expiresAt,
        remaining: p.maxUses == null ? null : Math.max(0, p.maxUses - p.usedCount),
      }));
  }

  async listPromos() {
    const promos = await this.prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { redemptions: true } } },
    });
    return promos.map((p) => ({
      id: p.id, code: p.code, type: p.type, amount: Number(p.amount.toString()),
      percentage: p.percentage, maxUses: p.maxUses, usedCount: p.usedCount,
      minDeposit: Number(p.minDeposit.toString()), wagerMultiplier: p.wagerMultiplier,
      expiresAt: p.expiresAt, active: p.active, redemptions: p._count.redemptions,
      createdAt: p.createdAt,
    }));
  }

  async createPromo(dto: { code: string; type?: string; amount?: number; percentage?: number; maxUses?: number | null; minDeposit?: number; wagerMultiplier?: number; expiresAt?: string | null; active?: boolean }) {
    const code = dto.code.trim().toUpperCase();
    const dupe = await this.prisma.promoCode.findUnique({ where: { code }, select: { id: true } });
    if (dupe) throw new BadRequestException("A promo code with that name already exists");
    return this.prisma.promoCode.create({
      data: {
        code,
        type: (dto.type as Prisma.PromoCodeCreateInput["type"]) ?? "FREE_CREDIT",
        amount: dto.amount ?? 0, percentage: dto.percentage ?? 0,
        maxUses: dto.maxUses ?? null, minDeposit: dto.minDeposit ?? 0,
        wagerMultiplier: dto.wagerMultiplier ?? 1,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        active: dto.active ?? true,
      },
    });
  }

  updatePromo(id: string, dto: Partial<{ active: boolean; amount: number; percentage: number; maxUses: number | null; minDeposit: number; wagerMultiplier: number; expiresAt: string | null }>) {
    const data: Prisma.PromoCodeUpdateInput = {};
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.percentage !== undefined) data.percentage = dto.percentage;
    if (dto.maxUses !== undefined) data.maxUses = dto.maxUses;
    if (dto.minDeposit !== undefined) data.minDeposit = dto.minDeposit;
    if (dto.wagerMultiplier !== undefined) data.wagerMultiplier = dto.wagerMultiplier;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    return this.prisma.promoCode.update({ where: { id }, data });
  }

  deletePromo(id: string) {
    return this.prisma.promoCode.delete({ where: { id } });
  }

  // ── Support tickets ──────────────────────────────────────────────────────────────
  async listSupportTickets(status?: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: status ? { status: status as Prisma.EnumSupportStatusFilter } : {},
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        user: { select: { username: true } },
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, isAdmin: true, createdAt: true } },
      },
    });
    return tickets.map((t) => ({
      id: t.id, subject: t.subject, status: t.status, priority: t.priority,
      username: t.user?.username ?? "—", messageCount: t._count.messages,
      lastMessage: t.messages[0] ?? null, createdAt: t.createdAt, updatedAt: t.updatedAt,
    }));
  }

  getSupportTicket(id: string) {
    return this.prisma.supportTicket.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, username: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async replySupportTicket(adminId: string, id: string, body: string) {
    await this.prisma.supportMessage.create({ data: { ticketId: id, authorId: adminId, body, isAdmin: true } });
    // An admin reply moves the ticket to PENDING (awaiting the user) unless already closed.
    return this.prisma.supportTicket.update({ where: { id }, data: { status: "PENDING" } });
  }

  setSupportStatus(id: string, status: string) {
    return this.prisma.supportTicket.update({ where: { id }, data: { status: status as Prisma.SupportTicketUpdateInput["status"] } });
  }

  // ── Security Center ────────────────────────────────────────────────────────────
  async getSecurityOverview() {
    const now = new Date();
    const last24h = new Date(Date.now() - 24 * 60 * 60_000);
    const [staffTotal, staff2fa, activeSessions, adminActions24h, distinctIps, settings] = await Promise.all([
      this.prisma.user.count({ where: { role: { not: UserRole.USER } } }),
      this.prisma.user.count({ where: { role: { not: UserRole.USER }, twoFactorEnabled: true } }),
      this.prisma.refreshToken.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.adminLog.count({ where: { createdAt: { gte: last24h } } }),
      this.prisma.refreshToken.findMany({ where: { createdAt: { gte: last24h } }, select: { ip: true }, distinct: ["ip"] }),
      this.getPlatformSettings() as Promise<Record<string, unknown>>,
    ]);
    return {
      staffTotal,
      staff2fa,
      activeSessions,
      adminActions24h,
      uniqueIps24h: distinctIps.filter((d) => d.ip).length,
      ipAllowlist: (settings.securityIpAllowlist as string[]) ?? [],
      antiDdosEnabled: (settings.antiDdosEnabled as boolean) ?? false,
    };
  }

  async listActiveSessions(limit = 100) {
    const now = new Date();
    const sessions = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 300),
      include: { user: { select: { id: true, username: true, role: true } } },
    });
    return sessions.map((s) => ({
      id: s.id, userId: s.userId, username: s.user.username, role: s.user.role,
      ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, expiresAt: s.expiresAt,
    }));
  }

  async revokeSession(tokenId: string) {
    await this.prisma.refreshToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } }).catch(() => undefined);
    return { ok: true };
  }

  async revokeUserSessions(userId: string) {
    const r = await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true, revoked: r.count };
  }

  list2faStatus() {
    return this.prisma.user.findMany({
      where: { role: { not: UserRole.USER } },
      orderBy: { username: "asc" },
      select: { id: true, username: true, role: true, twoFactorEnabled: true, lastLoginAt: true, lastLoginIp: true },
    });
  }

  saveSecurityConfig(dto: { ipAllowlist?: string[]; antiDdosEnabled?: boolean }) {
    const patch: Record<string, unknown> = {};
    if (dto.ipAllowlist !== undefined) patch.securityIpAllowlist = dto.ipAllowlist;
    if (dto.antiDdosEnabled !== undefined) patch.antiDdosEnabled = dto.antiDdosEnabled;
    return this.savePlatformSettings(patch);
  }
}

