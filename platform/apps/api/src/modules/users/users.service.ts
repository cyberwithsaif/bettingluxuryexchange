import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole, UserStatus, LedgerKind } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { levelFromDeposits } from "@exch/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";

const ROLE_RANK: Record<UserRole, number> = {
  SUPER_ADMIN: 100, ADMIN: 80, SUPER_MASTER: 60, MASTER: 40, AGENT: 20, BOOKIE: 30, USER: 0,
};

const CHILD_ROLES: Record<UserRole, UserRole[]> = {
  SUPER_ADMIN: ["ADMIN", "SUPER_MASTER", "MASTER", "AGENT", "BOOKIE", "USER"],
  ADMIN:       ["SUPER_MASTER", "MASTER", "AGENT", "BOOKIE", "USER"],
  SUPER_MASTER:["MASTER", "AGENT", "USER"],
  MASTER:      ["AGENT", "USER"],
  AGENT:       ["USER"],
  BOOKIE:      ["USER"],
  USER:        [],
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  /** Referral commission rate in basis points (admin-tunable platform setting). */
  private async referralRateBps(): Promise<number> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: "platform" } });
    const v = (row?.value ?? {}) as Record<string, unknown>;
    const bps = Number(v.referralCommissionBps ?? 50); // default 0.5% of wagers
    return Math.max(0, Math.min(10_000, Math.round(bps)));
  }

  // Per-worker cooldown so a polling/refresh-spamming client can't turn every
  // page view into N aggregate queries. 60s staleness on accrual is fine.
  private lastReconcileAt = new Map<string, number>();

  /**
   * Accrue referral commission for everyone this user referred: rate% of each
   * referred user's lifetime wagered amount (casino bets net of refunds +
   * settled sports losses), high-water marked on the referred user so each
   * rupee wagered is commissioned exactly once. The optimistic guard on the
   * mark makes concurrent calls (PM2 cluster) safe. No-throw: must never
   * break the page read.
   */
  private async reconcileReferralCommission(referrerId: string, rateBps: number) {
    if (rateBps <= 0) return;
    const last = this.lastReconcileAt.get(referrerId) ?? 0;
    if (Date.now() - last < 60_000) return;
    this.lastReconcileAt.set(referrerId, Date.now());

    const referred = await this.prisma.user.findMany({
      where: { referredById: referrerId },
      select: { id: true, username: true, refCommissionedWager: true },
      take: 500,
    });
    for (const r of referred) {
      try {
        const [bets, refunds] = await Promise.all([
          this.prisma.ledgerEntry.aggregate({
            _sum: { amount: true },
            where: {
              userId: r.id,
              amount: { lt: 0 },
              kind: { in: [LedgerKind.CASINO_BET, LedgerKind.BET_SETTLE_LOSS] },
            },
          }),
          // Refunded/voided casino bets are not real turnover — net them out.
          this.prisma.ledgerEntry.aggregate({
            _sum: { amount: true },
            where: { userId: r.id, amount: { gt: 0 }, kind: LedgerKind.CASINO_REFUND },
          }),
        ]);
        const wagered = Math.max(0,
          Math.abs(Number(bets._sum.amount ?? 0)) - Number(refunds._sum.amount ?? 0));
        const marked = Number(r.refCommissionedWager);
        if (wagered <= marked) continue;

        const commission = Math.round(((wagered - marked) * rateBps / 10_000) * 100) / 100;
        // Below a paisa: leave the mark untouched so small deltas accrue
        // until they round to something payable, instead of being burned.
        if (commission < 0.01) continue;

        // Advance the mark first; only the writer that wins this race pays out.
        const guard = await this.prisma.user.updateMany({
          where: { id: r.id, refCommissionedWager: r.refCommissionedWager },
          data: { refCommissionedWager: new Prisma.Decimal(wagered) },
        });
        if (guard.count !== 1) continue;

        await this.wallet.applyLedger({
          userId: referrerId,
          amount: commission,
          kind: LedgerKind.COMMISSION_PAYOUT,
          refType: "referral",
          refId: r.id,
          note: `Referral commission from ${r.username}`,
        });
      } catch { /* skip this child; never break the read */ }
    }
  }

  /**
   * Referral / earnings summary for the logged-in user.
   * Only refType="referral" COMMISSION_PAYOUT credits count here — the same
   * ledger kind is also used for bookie→admin commission collection
   * (refType="commission"), which is internal and must NOT appear as
   * player referral earnings.
   */
  async getReferral(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const rateBps = await this.referralRateBps();
    await this.reconcileReferralCommission(userId, rateBps);

    const referralWhere = {
      userId,
      kind: LedgerKind.COMMISSION_PAYOUT,
      refType: "referral",
      amount: { gt: 0 },
    } as const;

    const [referralCount, commission, recent] = await Promise.all([
      this.prisma.user.count({ where: { referredById: userId } }),
      this.prisma.ledgerEntry.aggregate({ _sum: { amount: true }, where: referralWhere }),
      this.prisma.ledgerEntry.findMany({
        where: referralWhere,
        orderBy: { createdAt: "desc" }, take: 12,
        select: { id: true, amount: true, createdAt: true, note: true },
      }),
    ]);
    const code = `${(u?.username ?? "").toUpperCase().slice(0, 6)}${userId.slice(-4)}`;
    return {
      code,
      referralCount,
      totalCommission: Number(commission._sum.amount ?? 0),
      commissionPct: rateBps / 100,
      recent: recent.map(r => ({ id: r.id, amount: Number(r.amount), createdAt: r.createdAt, note: r.note })),
    };
  }

  /** Create a downline user. The created user's role must be a strictly-lower-rank role. */
  async createDownline(
    actorId: string,
    input: { username: string; password: string; role: UserRole; partnershipBps?: number; creditReference?: number },
  ) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor) throw new ForbiddenException();
    const allowed = CHILD_ROLES[actor.role];
    if (!allowed.includes(input.role)) {
      throw new ForbiddenException(`Role ${actor.role} cannot create ${input.role}`);
    }
    if ((input.partnershipBps ?? 0) < 0 || (input.partnershipBps ?? 0) > 10_000) {
      throw new BadRequestException("partnershipBps must be 0..10000 (basis points)");
    }
    const dup = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (dup) throw new ConflictException("Username taken");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const created = await this.prisma.user.create({
      data: {
        username: input.username,
        passwordHash,
        role: input.role,
        parentId: actor.id,
        partnershipBps: input.partnershipBps ?? 0,
        creditReference: new Prisma.Decimal(input.creditReference ?? 0),
        wallet: { create: {} },
        limits: { create: {} },
      },
    });
    return this.publicUser(created);
  }

  async listDownline(actorId: string, opts: { q?: string; role?: UserRole } = {}) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor) throw new ForbiddenException();

    // SUPER_ADMIN/ADMIN can see all users; others see only their downline
    const isGlobalAdmin = actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";

    const rows = await this.prisma.user.findMany({
      where: {
        ...(isGlobalAdmin ? {} : { parentId: actorId }),
        ...(opts.q ? { username: { contains: opts.q, mode: "insensitive" } } : {}),
        // Bookies are managed on the dedicated Manage Bookies screen, so the
        // generic Users list hides them unless a role filter explicitly asks.
        ...(opts.role ? { role: opts.role } : { role: { not: UserRole.BOOKIE } }),
      },
      include: { wallet: true, limits: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // VIP level is derived from total deposits (DEPOSIT + ADMIN_CREDIT) — the
    // same rule the web VIP page uses. One groupBy covers the whole page.
    const ids = rows.map((r) => r.id);
    const depGroups = ids.length ? await this.prisma.ledgerEntry.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, kind: { in: [LedgerKind.DEPOSIT, LedgerKind.ADMIN_CREDIT] }, amount: { gt: 0 } },
      _sum: { amount: true },
    }) : [];
    const depMap = new Map<string, number>();
    for (const g of depGroups) depMap.set(g.userId, Number(g._sum.amount ?? 0));

    // Strip passwordHash / twoFactorSecret — same as every other method here.
    return rows.map((u) => {
      const lvl = levelFromDeposits(depMap.get(u.id) ?? 0);
      return { ...this.publicUser(u), vipLevel: { name: lvl.name, tier: lvl.tier, color: lvl.color } };
    });
  }

  async setStatus(actorId: string, targetId: string, status: UserStatus) {
    await this.assertOverrules(actorId, targetId);
    return this.prisma.user.update({ where: { id: targetId }, data: { status } });
  }

  async updateLimits(actorId: string, targetId: string, patch: Record<string, number | boolean>) {
    await this.assertOverrules(actorId, targetId);
    return this.prisma.userLimits.update({
      where: { userId: targetId },
      data: patch as Prisma.UserLimitsUpdateInput,
    });
  }

  async resetPassword(actorId: string, targetId: string, newPassword: string) {
    await this.assertOverrules(actorId, targetId);
    if (newPassword.length < 8) throw new BadRequestException("Password too short");
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: targetId }, data: { passwordHash } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async updateUser(
    actorId: string,
    targetId: string,
    patch: { role?: UserRole; partnershipBps?: number; creditReference?: number },
  ) {
    await this.assertOverrules(actorId, targetId);

    // If changing role, validate the new role is still a valid child
    if (patch.role) {
      const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
      if (!actor) throw new ForbiddenException();
      const allowed = CHILD_ROLES[actor.role];
      if (!allowed.includes(patch.role)) {
        throw new ForbiddenException(`Cannot assign role ${patch.role}`);
      }
    }

    const data: Record<string, unknown> = {};
    if (patch.role !== undefined)            data.role            = patch.role;
    if (patch.partnershipBps !== undefined)  data.partnershipBps  = patch.partnershipBps;
    if (patch.creditReference !== undefined) data.creditReference = new Prisma.Decimal(patch.creditReference);

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data,
      include: { wallet: true, limits: true },
    });
    return this.publicUser(updated);
  }

  /**
   * `actor` must (a) outrank `target` and (b) be in `target`'s upline chain
   * (or be a global SUPER_ADMIN / ADMIN). This is what stops a Master from
   * acting on another Master's customers.
   */
  private async assertOverrules(actorId: string, targetId: string) {
    if (actorId === targetId) throw new ForbiddenException("Cannot act on self");
    const [actor, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actorId } }),
      this.prisma.user.findUnique({ where: { id: targetId } }),
    ]);
    if (!actor || !target) throw new NotFoundException();
    if (ROLE_RANK[actor.role] <= ROLE_RANK[target.role]) {
      throw new ForbiddenException("Insufficient rank to act on this user");
    }
    if (actor.role === "SUPER_ADMIN" || actor.role === "ADMIN") return;

    // Walk up the chain
    let cur: typeof target | null = target;
    for (let i = 0; i < 10 && cur; i++) {
      if (cur.parentId === actor.id) return;
      cur = cur.parentId ? await this.prisma.user.findUnique({ where: { id: cur.parentId } }) : null;
    }
    throw new ForbiddenException("Target is not in your downline");
  }

  private publicUser<T extends { passwordHash: string; twoFactorSecret: string | null }>(u: T) {
    const { passwordHash: _p, twoFactorSecret: _t, ...rest } = u;
    return rest;
  }
}
