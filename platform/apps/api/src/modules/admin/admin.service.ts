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
      await tx.wallet.update({
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
    const current = await this.getPlatformSettings();
    const merged = { ...current, ...dto };
    await this.prisma.systemConfig.upsert({
      where: { key: "platform" },
      create: { key: "platform", value: merged as any },
      update: { value: merged as any },
    });
    return merged;
  }
}

