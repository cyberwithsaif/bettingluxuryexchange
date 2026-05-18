import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
}
