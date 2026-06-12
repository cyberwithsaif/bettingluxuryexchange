import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from "@nestjs/common";
import { LedgerKind, Prisma, UserRole, UserStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import {
  CreateBookieDto, UpdateBookieDto, RechargeDto, CreateBookieUserDto, TransferDto,
} from "./dto";

const num = (d: Prisma.Decimal | number | null | undefined) =>
  d == null ? 0 : typeof d === "number" ? d : Number(d.toString());
const round2 = (n: number) => Math.round(n * 100) / 100;

// Gameplay ledger kinds whose signed sum tells us a player's net result.
// A user whose net across these is negative has *lost* money — and that loss
// is the bookie's profit (the admin then earns commission on it).
const GAMEPLAY_KINDS = [
  LedgerKind.BET_SETTLE_WIN, LedgerKind.BET_SETTLE_LOSS,
  LedgerKind.CASINO_BET, LedgerKind.CASINO_WIN, LedgerKind.CASINO_REFUND,
];

/**
 * BookieService owns both the admin→bookie management surface and the
 * bookie→user surface. Every read on the bookie side is scoped to
 * `parentId = <currentBookieId>` (the spec's `created_by_bookie_id` rule) so a
 * bookie can never touch another bookie's users, wallet or logs.
 *
 * All money moves go through WalletService (atomic ledger writes); every
 * mutation also appends an AdminLog row for the audit trail.
 */
@Injectable()
export class BookieService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  // ── helpers ───────────────────────────────────────────────────────────────

  private audit(actorId: string, action: string, target?: { type: string; id: string }, metadata?: unknown, ip?: string) {
    return this.prisma.adminLog.create({
      data: {
        actorId, action,
        targetType: target?.type, targetId: target?.id,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue,
        ip,
      },
    }).catch(() => undefined);
  }

  /** Strip secrets — never ship passwordHash / 2FA secret to a client. */
  private pub<T extends { passwordHash?: string; twoFactorSecret?: string | null }>(u: T) {
    const { passwordHash: _p, twoFactorSecret: _t, ...rest } = u;
    return rest;
  }

  private shapeBookie(b: any, profit = 0) {
    const balance = num(b.wallet?.balance);
    const creditLimit = num(b.creditLimit);
    const creditUsed = balance < 0 ? -balance : 0;
    const commissionBps = b.partnershipBps ?? 0;
    return {
      ...this.pub(b),
      wallet: b.wallet ? { ...b.wallet, balance, exposure: num(b.wallet.exposure) } : null,
      // partnershipBps is reused as the ADMIN's commission rate on this bookie's profit.
      commissionPct: round2(commissionBps / 100),
      creditLimit,
      creditUsed: round2(creditUsed),
      available: round2(balance + creditLimit),
      totalUsers: b._count?.children ?? 0,
      // bookieProfit = total losses of this bookie's players; admin earns commissionPct of it.
      bookieProfit: round2(profit),
      adminCommission: round2((profit * commissionBps) / 10_000),
    };
  }

  /**
   * Bookie profit = Σ over the bookie's players of each player's *net loss*
   * (a player who is net up contributes 0 — wins never reduce profit).
   * Returns a map bookieId → profit, computed in two queries regardless of
   * how many bookies are passed. No money moves: this is a reported figure.
   */
  private async profitForBookies(bookieIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    bookieIds.forEach((id) => map.set(id, 0));
    if (!bookieIds.length) return map;

    const children = await this.prisma.user.findMany({
      where: { parentId: { in: bookieIds } },
      select: { id: true, parentId: true },
    });
    if (!children.length) return map;
    const userToBookie = new Map(children.map((c) => [c.id, c.parentId as string]));

    const grouped = await this.prisma.ledgerEntry.groupBy({
      by: ["userId"],
      where: { userId: { in: children.map((c) => c.id) }, kind: { in: GAMEPLAY_KINDS } },
      _sum: { amount: true },
    });
    for (const g of grouped) {
      const net = num(g._sum.amount);
      if (net < 0) {
        const b = userToBookie.get(g.userId);
        if (b) map.set(b, round2((map.get(b) ?? 0) + -net));
      }
    }
    return map;
  }

  // Fetch a bookie row or throw. Optionally assert it really is a BOOKIE.
  private async getBookieOrThrow(bookieId: string) {
    const b = await this.prisma.user.findUnique({
      where: { id: bookieId },
      include: { wallet: true, _count: { select: { children: true } } },
    });
    if (!b || b.role !== UserRole.BOOKIE) throw new NotFoundException("Bookie not found");
    return b;
  }

  /**
   * Collect any newly-accrued admin commission from the bookie's wallet into the
   * admin (parent) wallet, writing COMMISSION_PAYOUT ledger rows on both sides.
   *
   * Uses User.commissionedProfit as a high-water mark so commission is only ever
   * charged on *increases* in profit (player wins never refund), and an optimistic
   * guard on that mark means concurrent/duplicate calls can't double-charge.
   * Returns the amount collected (0 if nothing accrued). No-throw: a failure here
   * must never break the read that triggered it.
   */
  async reconcileCommission(bookieId: string): Promise<number> {
    try {
      const b = await this.prisma.user.findUnique({
        where: { id: bookieId },
        select: { id: true, role: true, parentId: true, partnershipBps: true, commissionedProfit: true },
      });
      if (!b || b.role !== UserRole.BOOKIE || !b.parentId || (b.partnershipBps ?? 0) <= 0) return 0;

      const profit = (await this.profitForBookies([bookieId])).get(bookieId) ?? 0;
      const marked = num(b.commissionedProfit);
      if (profit <= marked) return 0;

      const increment = round2(profit - marked);
      const commission = round2((increment * b.partnershipBps) / 10_000);

      // Advance the high-water mark first; only the writer that wins this race continues.
      const guard = await this.prisma.user.updateMany({
        where: { id: bookieId, commissionedProfit: b.commissionedProfit },
        data: { commissionedProfit: new Prisma.Decimal(profit) },
      });
      if (guard.count !== 1) return 0;
      if (commission <= 0) return 0;

      // Make sure the recipient (admin) has a wallet, then move the money atomically.
      await this.prisma.wallet.upsert({ where: { userId: b.parentId }, create: { userId: b.parentId }, update: {} });
      await this.wallet.transfer({
        fromUserId: bookieId, toUserId: b.parentId, amount: commission,
        kind: LedgerKind.COMMISSION_PAYOUT, fromFloor: -1e12,  // commission is owed; allow the float to dip
        refType: "commission", refId: bookieId,
        note: `Admin commission ${round2(b.partnershipBps / 100)}% on ₹${increment} profit`,
      });
      await this.audit(b.parentId, "bookie.commission_collected", { type: "bookie", id: bookieId }, { increment, commission }, undefined);
      return commission;
    } catch (e) {
      return 0;
    }
  }

  /** Total commission already collected from a bookie (abs of COMMISSION_PAYOUT debits). */
  private async commissionCollected(bookieId: string): Promise<number> {
    const r = await this.prisma.ledgerEntry.aggregate({
      _sum: { amount: true },
      where: { userId: bookieId, kind: LedgerKind.COMMISSION_PAYOUT, amount: { lt: 0 } },
    });
    return round2(Math.abs(num(r._sum.amount)));
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SETTINGS — platform-wide default admin commission for new bookies
  // ════════════════════════════════════════════════════════════════════════

  private static readonly DEFAULT_COMM_KEY = "bookie_default_commission_bps";

  /** The default admin-commission rate (in bps) applied to newly created bookies. */
  async getDefaultCommissionBps(): Promise<number> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: BookieService.DEFAULT_COMM_KEY } });
    const v = row?.value as unknown;
    const bps = typeof v === "number" ? v : 0;
    return Math.max(0, Math.min(10_000, Math.round(bps)));
  }

  async getSettings() {
    return { defaultCommissionPct: round2((await this.getDefaultCommissionBps()) / 100) };
  }

  async saveSettings(actorId: string, defaultCommissionBps: number, ip?: string) {
    const bps = Math.max(0, Math.min(10_000, Math.round(defaultCommissionBps || 0)));
    await this.prisma.systemConfig.upsert({
      where: { key: BookieService.DEFAULT_COMM_KEY },
      create: { key: BookieService.DEFAULT_COMM_KEY, value: bps },
      update: { value: bps },
    });
    await this.audit(actorId, "bookie.default_commission", undefined, { defaultCommissionBps: bps }, ip);
    return { defaultCommissionPct: round2(bps / 100) };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ADMIN-FACING
  // ════════════════════════════════════════════════════════════════════════

  async listBookies(opts: { q?: string } = {}) {
    const rows = await this.prisma.user.findMany({
      where: {
        role: UserRole.BOOKIE,
        ...(opts.q ? { OR: [
          { username: { contains: opts.q, mode: "insensitive" } },
          { fullName: { contains: opts.q, mode: "insensitive" } },
        ] } : {}),
      },
      include: { wallet: true, _count: { select: { children: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const profit = await this.profitForBookies(rows.map((r) => r.id));
    return rows.map((r) => this.shapeBookie(r, profit.get(r.id) ?? 0));
  }

  async createBookie(actorId: string, dto: CreateBookieDto, ip?: string) {
    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) {
      throw new ConflictException("Username taken");
    }
    // Fall back to the platform default commission when none is given.
    const commissionBps = dto.commissionBps ?? (await this.getDefaultCommissionBps());
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const bookie = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        role: UserRole.BOOKIE,
        parentId: actorId,
        fullName: dto.fullName || null,
        email: dto.email || null,
        phone: dto.phone || null,
        partnershipBps: commissionBps,
        creditLimit: new Prisma.Decimal(dto.creditLimit ?? 0),
        wallet: { create: {} },
        limits: { create: {} },
      },
    });

    // Seed initial float (minted by admin) if requested.
    if (dto.initialBalance && dto.initialBalance > 0) {
      await this.wallet.applyLedger({
        userId: bookie.id, kind: LedgerKind.BOOKIE_RECHARGE,
        amount: dto.initialBalance, refType: "bookie", refId: actorId,
        note: "Initial wallet float on creation",
      });
    }

    await this.audit(actorId, "bookie.create", { type: "bookie", id: bookie.id },
      { username: dto.username, initialBalance: dto.initialBalance ?? 0, commissionBps }, ip);
    return this.pub(bookie);
  }

  async updateBookie(actorId: string, bookieId: string, dto: UpdateBookieDto, ip?: string) {
    await this.getBookieOrThrow(bookieId);
    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined)      data.fullName       = dto.fullName || null;
    if (dto.email !== undefined)         data.email          = dto.email || null;
    if (dto.phone !== undefined)         data.phone          = dto.phone || null;
    if (dto.commissionBps !== undefined) data.partnershipBps = dto.commissionBps;
    if (dto.creditLimit !== undefined)   data.creditLimit    = new Prisma.Decimal(dto.creditLimit);
    const updated = await this.prisma.user.update({ where: { id: bookieId }, data });
    await this.audit(actorId, "bookie.update", { type: "bookie", id: bookieId }, dto, ip);
    return this.pub(updated);
  }

  /** Admin add (+) / deduct (-) of a bookie's wallet float. */
  async recharge(actorId: string, bookieId: string, dto: RechargeDto, ip?: string) {
    await this.getBookieOrThrow(bookieId);
    if (!dto.amount || dto.amount === 0) throw new BadRequestException("Amount must be non-zero");
    const out = await this.wallet.applyLedger({
      userId: bookieId,
      kind: LedgerKind.BOOKIE_RECHARGE,
      amount: dto.amount,                 // signed
      refType: "bookie", refId: actorId,
      note: dto.note ?? (dto.amount > 0 ? "Admin recharge" : "Admin deduction"),
      allowNegative: dto.amount < 0,
    });
    await this.audit(actorId, dto.amount > 0 ? "bookie.recharge" : "bookie.deduct",
      { type: "bookie", id: bookieId }, { amount: dto.amount, note: dto.note }, ip);
    return out;
  }

  async setBookieStatus(actorId: string, bookieId: string, status: UserStatus, ip?: string) {
    await this.getBookieOrThrow(bookieId);
    const updated = await this.prisma.user.update({ where: { id: bookieId }, data: { status } });
    // Suspending/locking kills active sessions immediately.
    if (status !== UserStatus.ACTIVE) await this.killSessions(bookieId);
    await this.audit(actorId, "bookie.status", { type: "bookie", id: bookieId }, { status }, ip);
    return this.pub(updated);
  }

  /** Revoke refresh tokens + bump tokenVersion so every access token dies now. */
  async forceLogout(actorId: string, bookieId: string, ip?: string) {
    await this.getBookieOrThrow(bookieId);
    await this.killSessions(bookieId);
    await this.audit(actorId, "bookie.force_logout", { type: "bookie", id: bookieId }, undefined, ip);
    return { ok: true };
  }

  private async killSessions(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Full profile + rolled-up stats for one bookie (admin detail page). */
  async getBookieDetail(bookieId: string) {
    await this.reconcileCommission(bookieId);   // auto-collect any newly accrued commission
    const b = await this.getBookieOrThrow(bookieId);
    const childIds = (await this.prisma.user.findMany({
      where: { parentId: bookieId }, select: { id: true, status: true },
    }));
    const ids = childIds.map((c) => c.id);
    const stats = await this.rollup(ids);
    const profit = (await this.profitForBookies([bookieId])).get(bookieId) ?? 0;
    const commissionBps = b.partnershipBps ?? 0;
    const collected = await this.commissionCollected(bookieId);
    const [walletLogs, activity] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { userId: bookieId, kind: { in: [LedgerKind.BOOKIE_RECHARGE, LedgerKind.BOOKIE_TO_USER, LedgerKind.USER_TO_BOOKIE, LedgerKind.COMMISSION_PAYOUT] } },
        orderBy: { createdAt: "desc" }, take: 30,
      }),
      this.prisma.adminLog.findMany({
        where: { OR: [{ actorId: bookieId }, { targetId: bookieId }] },
        orderBy: { createdAt: "desc" }, take: 20,
      }),
    ]);
    const adminCommission = round2((profit * commissionBps) / 10_000);
    return {
      bookie: this.shapeBookie(b, profit),
      stats: {
        ...stats,
        totalUsers: ids.length,
        activeUsers: childIds.filter((c) => c.status === "ACTIVE").length,
        bookieProfit: round2(profit),
        commissionPct: round2(commissionBps / 100),
        adminCommission,
        commissionCollected: collected,
        commissionPending: round2(Math.max(0, adminCommission - collected)),
      },
      walletLogs,
      activity,
    };
  }

  async walletLogs(bookieId: string) {
    await this.getBookieOrThrow(bookieId);
    return this.prisma.ledgerEntry.findMany({
      where: { userId: bookieId, kind: { in: [LedgerKind.BOOKIE_RECHARGE, LedgerKind.BOOKIE_TO_USER, LedgerKind.USER_TO_BOOKIE, LedgerKind.COMMISSION_PAYOUT] } },
      orderBy: { createdAt: "desc" }, take: 200,
    });
  }

  async activity(bookieId: string) {
    await this.getBookieOrThrow(bookieId);
    return this.prisma.adminLog.findMany({
      where: { OR: [{ actorId: bookieId }, { targetId: bookieId }] },
      orderBy: { createdAt: "desc" }, take: 200,
    });
  }

  async bookieUsers(bookieId: string) {
    await this.getBookieOrThrow(bookieId);
    const rows = await this.prisma.user.findMany({
      where: { parentId: bookieId }, include: { wallet: true },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    return rows.map((u) => this.pub(u));
  }

  // ════════════════════════════════════════════════════════════════════════
  //  BOOKIE-FACING  (actor === the logged-in bookie)
  // ════════════════════════════════════════════════════════════════════════

  async dashboard(bookieId: string) {
    await this.reconcileCommission(bookieId);   // auto-collect commission before showing the wallet
    const me = await this.prisma.user.findUnique({ where: { id: bookieId }, include: { wallet: true } });
    if (!me) throw new ForbiddenException();
    const children = await this.prisma.user.findMany({
      where: { parentId: bookieId }, select: { id: true, status: true },
    });
    const ids = children.map((c) => c.id);
    const stats = await this.rollup(ids);

    const balance = num(me.wallet?.balance);
    const creditLimit = num(me.creditLimit);
    const commissionBps = me.partnershipBps ?? 0;
    const profit = (await this.profitForBookies([bookieId])).get(bookieId) ?? 0;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const [depToday, pendingW, exposureAgg] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { userId: { in: ids }, kind: { in: [LedgerKind.DEPOSIT, LedgerKind.BOOKIE_TO_USER] }, amount: { gt: 0 }, createdAt: { gte: since } },
      }),
      this.prisma.transaction.count({ where: { userId: { in: ids }, kind: "WITHDRAWAL", status: "PENDING" } }),
      this.prisma.wallet.aggregate({ _sum: { exposure: true }, where: { userId: { in: ids } } }),
    ]);

    return {
      wallet: { balance: round2(balance), exposure: num(me.wallet?.exposure), creditLimit, available: round2(balance + creditLimit) },
      totalUsers: ids.length,
      activeUsers: children.filter((c) => c.status === "ACTIVE").length,
      totalBets: stats.totalBets,
      // Bookie profit = total player losses; admin earns commissionPct of it,
      // auto-deducted from this wallet (adminCommission = total earned to date).
      bookieProfit: round2(profit),
      commissionPct: round2(commissionBps / 100),
      adminCommission: round2((profit * commissionBps) / 10_000),
      commissionCollected: await this.commissionCollected(bookieId),
      pendingWithdrawals: pendingW,
      depositsToday: round2(num(depToday._sum.amount)),
      exposure: round2(num(exposureAgg._sum.exposure)),
    };
  }

  async myUsers(bookieId: string, opts: { q?: string } = {}) {
    const rows = await this.prisma.user.findMany({
      where: {
        parentId: bookieId,
        ...(opts.q ? { username: { contains: opts.q, mode: "insensitive" } } : {}),
      },
      include: { wallet: true, limits: true },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    return rows.map((u) => this.pub(u));
  }

  async createUser(bookieId: string, dto: CreateBookieUserDto, ip?: string) {
    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) {
      throw new ConflictException("Username taken");
    }
    // Validate the bookie can fund the requested opening balance before creating.
    const bookie = await this.prisma.user.findUnique({ where: { id: bookieId }, include: { wallet: true } });
    if (!bookie) throw new ForbiddenException();
    const opening = dto.initialBalance ?? 0;
    if (opening > 0) {
      const avail = num(bookie.wallet?.balance) + num(bookie.creditLimit);
      if (opening > avail) throw new BadRequestException("Opening balance exceeds your available wallet + credit");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username, passwordHash, role: UserRole.USER, parentId: bookieId,
        email: dto.email || null, phone: dto.phone || null,
        wallet: { create: {} },
        limits: { create: {
          ...(dto.minStake != null ? { minStake: new Prisma.Decimal(dto.minStake) } : {}),
          ...(dto.maxStake != null ? { maxStake: new Prisma.Decimal(dto.maxStake) } : {}),
        } },
      },
    });

    if (opening > 0) {
      await this.wallet.transfer({
        fromUserId: bookieId, toUserId: user.id, amount: opening,
        kind: LedgerKind.BOOKIE_TO_USER, fromFloor: -num(bookie.creditLimit),
        refType: "user", refId: user.id, note: "Opening balance",
      });
    }

    await this.audit(bookieId, "user.create", { type: "user", id: user.id },
      { username: dto.username, openingBalance: opening }, ip);
    return this.pub(user);
  }

  async transfer(bookieId: string, dto: TransferDto, ip?: string) {
    const user = await this.assertOwnsUser(bookieId, dto.userId);
    const bookie = await this.prisma.user.findUnique({ where: { id: bookieId } });
    if (!bookie) throw new ForbiddenException();

    let out;
    if (dto.direction === "credit") {
      // bookie → user
      out = await this.wallet.transfer({
        fromUserId: bookieId, toUserId: user.id, amount: dto.amount,
        kind: LedgerKind.BOOKIE_TO_USER, fromFloor: -num(bookie.creditLimit),
        refType: "user", refId: user.id, note: "Bookie credit",
      });
    } else {
      // user → bookie  (users can never go negative)
      out = await this.wallet.transfer({
        fromUserId: user.id, toUserId: bookieId, amount: dto.amount,
        kind: LedgerKind.USER_TO_BOOKIE, fromFloor: 0,
        refType: "user", refId: user.id, note: "Bookie debit",
      });
    }
    await this.audit(bookieId, dto.direction === "credit" ? "user.credit" : "user.debit",
      { type: "user", id: user.id }, { amount: dto.amount }, ip);
    return out;
  }

  async setUserStatus(bookieId: string, userId: string, status: UserStatus, ip?: string) {
    await this.assertOwnsUser(bookieId, userId);
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { status } });
    if (status !== UserStatus.ACTIVE) await this.killSessions(userId);
    await this.audit(bookieId, "user.status", { type: "user", id: userId }, { status }, ip);
    return this.pub(updated);
  }

  async resetUserPassword(bookieId: string, userId: string, password: string, ip?: string) {
    await this.assertOwnsUser(bookieId, userId);
    if (password.length < 8) throw new BadRequestException("Password too short");
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.killSessions(userId);
    await this.audit(bookieId, "user.reset_password", { type: "user", id: userId }, undefined, ip);
    return { ok: true };
  }

  /** The bookie's own wallet view: float, totals, credit, pending withdrawals + ledger. */
  async myWallet(bookieId: string) {
    await this.reconcileCommission(bookieId);
    const me = await this.prisma.user.findUnique({ where: { id: bookieId }, include: { wallet: true } });
    if (!me) throw new ForbiddenException();
    const childIds = (await this.prisma.user.findMany({ where: { parentId: bookieId }, select: { id: true } })).map((c) => c.id);
    const [added, deducted, pendingW, ledger] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({ _sum: { amount: true }, where: { userId: bookieId, kind: LedgerKind.BOOKIE_RECHARGE, amount: { gt: 0 } } }),
      this.prisma.ledgerEntry.aggregate({ _sum: { amount: true }, where: { userId: bookieId, kind: LedgerKind.BOOKIE_RECHARGE, amount: { lt: 0 } } }),
      this.prisma.transaction.count({ where: { userId: { in: childIds }, kind: "WITHDRAWAL", status: "PENDING" } }),
      this.prisma.ledgerEntry.findMany({ where: { userId: bookieId }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    const balance = num(me.wallet?.balance);
    const creditLimit = num(me.creditLimit);
    return {
      balance: round2(balance),
      creditLimit,
      creditUsed: round2(balance < 0 ? -balance : 0),
      available: round2(balance + creditLimit),
      totalAdded: round2(num(added._sum.amount)),
      totalDeducted: round2(Math.abs(num(deducted._sum.amount))),
      pendingWithdrawals: pendingW,
      ledger,
    };
  }

  async myTransactions(bookieId: string) {
    await this.reconcileCommission(bookieId);
    return this.prisma.ledgerEntry.findMany({
      where: { userId: bookieId, kind: { in: [LedgerKind.BOOKIE_RECHARGE, LedgerKind.BOOKIE_TO_USER, LedgerKind.USER_TO_BOOKIE, LedgerKind.COMMISSION_PAYOUT] } },
      orderBy: { createdAt: "desc" }, take: 200,
    });
  }

  async profile(bookieId: string) {
    const me = await this.prisma.user.findUnique({
      where: { id: bookieId },
      include: { wallet: true, limits: true, _count: { select: { children: true } } },
    });
    if (!me) throw new ForbiddenException();
    const profit = (await this.profitForBookies([bookieId])).get(bookieId) ?? 0;
    return this.shapeBookie(me, profit);
  }

  // ── shared ──────────────────────────────────────────────────────────────

  /** A bookie may only act on users they parent. Returns the user row. */
  private async assertOwnsUser(bookieId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.parentId !== bookieId) throw new ForbiddenException("Not your user");
    return user;
  }

  // ── Read-only player profile (bookie view) ─────────────────────────────────
  /** Full profile for one of the bookie's own players — read only. */
  async userProfile(bookieId: string, userId: string) {
    await this.assertOwnsUser(bookieId, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true, limits: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const [ledgerGroups, betGroups, casinoGameRows, recentTxns, recentBets, recentLedger, pendingReqs] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({ by: ["kind"], where: { userId }, _sum: { amount: true } }),
      this.prisma.bet.groupBy({ by: ["status"], where: { userId }, _count: { _all: true }, _sum: { stake: true } }),
      this.prisma.ledgerEntry.groupBy({
        by: ["refType", "kind"], _sum: { amount: true }, _count: true,
        where: { userId, kind: { in: [LedgerKind.CASINO_BET, LedgerKind.CASINO_WIN, LedgerKind.CASINO_REFUND] } },
      }),
      this.prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 15,
        select: { id: true, kind: true, method: true, amount: true, status: true, reference: true, createdAt: true } }),
      this.prisma.bet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 15,
        include: { market: { select: { name: true } }, runner: { select: { name: true } } } }),
      this.prisma.ledgerEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 40,
        select: { id: true, kind: true, amount: true, balanceAfter: true, exposureDelta: true, note: true, createdAt: true } }),
      this.prisma.supportTicket.count({ where: { userId: bookieId, status: { in: ["OPEN", "PENDING"] }, subject: { contains: `::${userId}` } } }),
    ]);

    const lm: Record<string, number> = {};
    for (const g of ledgerGroups) lm[g.kind] = num(g._sum.amount);
    const bm: Record<string, number> = {};
    for (const g of betGroups) bm[g.status] = g._count._all;
    const totalBets = betGroups.reduce((s, b) => s + b._count._all, 0);
    const wonBets = bm["SETTLED_WON"] ?? 0, lostBets = bm["SETTLED_LOST"] ?? 0;

    const gameMap = new Map<string, { wagered: number; payout: number; bets: number }>();
    for (const r of casinoGameRows) {
      const game = (r.refType ?? "other").replace(/_(bet|win|refund|cashout)s?$/i, "").replace(/_/g, " ");
      const g = gameMap.get(game) ?? { wagered: 0, payout: 0, bets: 0 };
      const amt = num(r._sum.amount);
      if (r.kind === "CASINO_BET") { g.wagered += Math.abs(amt); g.bets += r._count as number; }
      else g.payout += Math.max(0, amt);
      gameMap.set(game, g);
    }

    return {
      user: {
        id: user.id, username: user.username, email: user.email, phone: user.phone,
        status: user.status, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt, lastLoginIp: user.lastLoginIp,
      },
      wallet: { balance: round2(num(user.wallet?.balance)), exposure: round2(num(user.wallet?.exposure)), bonus: round2(num(user.wallet?.bonus)), available: round2(num(user.wallet?.balance) - num(user.wallet?.exposure)) },
      limits: user.limits ? {
        minStake: num(user.limits.minStake), maxStake: num(user.limits.maxStake),
        maxMarketExposure: num(user.limits.maxMarketExposure), maxDailyLoss: num(user.limits.maxDailyLoss),
        casinoEnabled: user.limits.casinoEnabled, fancyEnabled: user.limits.fancyEnabled,
      } : null,
      financials: {
        totalDeposits: Math.max(0, lm["DEPOSIT"] ?? 0),
        totalWithdrawals: Math.abs(Math.min(0, lm["WITHDRAWAL"] ?? 0)),
        casinoWins: Math.max(0, lm["CASINO_WIN"] ?? 0),
        casinoBets: Math.abs(Math.min(0, lm["CASINO_BET"] ?? 0)),
        betWins: Math.max(0, lm["BET_SETTLE_WIN"] ?? 0),
        betLosses: Math.abs(Math.min(0, lm["BET_SETTLE_LOSS"] ?? 0)),
      },
      bettingStats: {
        total: totalBets, won: wonBets, lost: lostBets, open: bm["OPEN"] ?? 0,
        totalStake: round2(betGroups.reduce((s, b) => s + num(b._sum.stake), 0)),
        winRate: (wonBets + lostBets) > 0 ? Number(((wonBets / (wonBets + lostBets)) * 100).toFixed(1)) : 0,
      },
      casinoByGame: [...gameMap.entries()].map(([game, g]) => ({
        game, bets: g.bets, wagered: round2(g.wagered), payout: round2(g.payout), net: round2(g.payout - g.wagered),
      })).sort((a, b) => b.wagered - a.wagered),
      recentTxns: recentTxns.map((t) => ({ ...t, amount: num(t.amount) })),
      recentBets: recentBets.map((b) => ({
        id: b.id, side: b.side, stake: num(b.stake), status: b.status, createdAt: b.createdAt,
        market: b.market?.name ?? null, runner: b.runner?.name ?? null,
      })),
      ledger: recentLedger.map((l) => ({
        id: l.id, kind: l.kind, amount: num(l.amount), balanceAfter: num(l.balanceAfter),
        exposureDelta: num(l.exposureDelta), note: l.note, createdAt: l.createdAt,
      })),
      pendingRequests: pendingReqs,
    };
  }

  // ── Request flow: bookie asks admin to act on a player ─────────────────────
  private static readonly REQUEST_TYPES = ["BLOCK", "UNBLOCK", "RESET_PASSWORD", "ADJUST_LIMIT", "CLOSE_ACCOUNT", "OTHER"] as const;

  /** A bookie can't modify a player directly — they file a request that lands
   *  in the admin Support queue (ticket owned by the bookie, subject tags the target). */
  async submitUserRequest(bookieId: string, userId: string, type: string, reason: string, ip?: string) {
    const target = await this.assertOwnsUser(bookieId, userId);
    const t = (type ?? "").toUpperCase();
    if (!(BookieService.REQUEST_TYPES as readonly string[]).includes(t)) throw new BadRequestException("Unknown request type");
    if (!reason?.trim()) throw new BadRequestException("Please describe the request");
    const bookie = await this.prisma.user.findUnique({ where: { id: bookieId }, select: { username: true } });

    const label: Record<string, string> = {
      BLOCK: "Block / suspend player", UNBLOCK: "Unblock player", RESET_PASSWORD: "Reset player password",
      ADJUST_LIMIT: "Adjust player limits", CLOSE_ACCOUNT: "Close player account", OTHER: "Other change",
    };
    // The ::<userId>::<TYPE> tag lets the admin (and our pending count) tie the
    // ticket to the player and recover the request type for auto-execution.
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: bookieId,
        subject: `[Bookie Request] ${label[t]} — ${target.username} ::${userId}::${t}`,
        priority: t === "BLOCK" || t === "CLOSE_ACCOUNT" ? "HIGH" : "NORMAL",
        status: "OPEN",
        messages: {
          create: {
            authorId: bookieId, isAdmin: false,
            body: `Bookie "${bookie?.username ?? bookieId}" requests: ${label[t]} for player "${target.username}" (id ${userId}).\n\nReason: ${reason.trim()}`,
          },
        },
      },
    });
    await this.audit(bookieId, "bookie.user_request", { type: "user", id: userId }, { requestType: t, ticketId: ticket.id }, ip);
    return { ok: true, ticketId: ticket.id };
  }

  // Parse the "::userId::TYPE" tag off a bookie-request subject.
  private static parseRequestSubject(subject: string) {
    const m = subject.match(/::([a-z0-9]+)(?:::([A-Z_]+))?$/i);
    const clean = subject.replace(/ ::[a-z0-9]+(?:::[A-Z_]+)?$/i, "").replace(/^\[Bookie Request\]\s*/, "");
    return { targetUserId: m?.[1] ?? null, type: m?.[2] ?? null, title: clean };
  }

  /** The bookie's own submitted requests (read-only history). */
  async myRequests(bookieId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId: bookieId, subject: { startsWith: "[Bookie Request]" } },
      orderBy: { updatedAt: "desc" }, take: 100,
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, isAdmin: true, createdAt: true } } },
    });
    return tickets.map((t) => {
      const p = BookieService.parseRequestSubject(t.subject);
      return {
        id: t.id, title: p.title, type: p.type, targetUserId: p.targetUserId,
        status: t.status, priority: t.priority,
        adminReply: t.messages[0]?.isAdmin ? t.messages[0] : null,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
      };
    });
  }

  // ── Admin side: review & action bookie requests ────────────────────────────
  /** All bookie requests across every bookie (admin view). */
  async listBookieRequests(opts: { status?: string } = {}) {
    const where: Prisma.SupportTicketWhereInput = { subject: { startsWith: "[Bookie Request]" } };
    if (opts.status && opts.status !== "ALL") where.status = opts.status as Prisma.EnumSupportStatusFilter;
    const tickets = await this.prisma.supportTicket.findMany({
      where, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 300,
      include: {
        user: { select: { id: true, username: true } }, // requesting bookie
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    // Resolve target usernames in one query.
    const targetIds = [...new Set(tickets.map((t) => BookieService.parseRequestSubject(t.subject).targetUserId).filter(Boolean) as string[])];
    const targets = targetIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: targetIds } }, select: { id: true, username: true, status: true } })
      : [];
    const tmap = new Map(targets.map((u) => [u.id, u]));

    const rows = tickets.map((t) => {
      const p = BookieService.parseRequestSubject(t.subject);
      const tgt = p.targetUserId ? tmap.get(p.targetUserId) : null;
      return {
        id: t.id, type: p.type, title: p.title, status: t.status, priority: t.priority,
        bookie: t.user ? { id: t.user.id, username: t.user.username } : null,
        target: tgt ? { id: tgt.id, username: tgt.username, status: tgt.status } : (p.targetUserId ? { id: p.targetUserId, username: "(deleted)", status: "—" } : null),
        reason: t.messages.find((m) => !m.isAdmin)?.body ?? null,
        messages: t.messages.map((m) => ({ id: m.id, body: m.body, isAdmin: m.isAdmin, createdAt: m.createdAt })),
        createdAt: t.createdAt, updatedAt: t.updatedAt,
      };
    });
    const pending = rows.filter((r) => r.status === "OPEN" || r.status === "PENDING").length;
    return { summary: { total: rows.length, pending }, rows };
  }

  /**
   * Approve or reject a bookie request. Approving a BLOCK/UNBLOCK/CLOSE_ACCOUNT
   * applies the status change to the target player automatically; password /
   * limit / other requests are marked approved for the admin to finish on the
   * user profile. Always posts an admin reply and resolves the ticket.
   */
  async actionBookieRequest(adminId: string, ticketId: string, action: "approve" | "reject", note?: string, ip?: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || !ticket.subject.startsWith("[Bookie Request]")) throw new NotFoundException("Request not found");
    const p = BookieService.parseRequestSubject(ticket.subject);

    let executed = "";
    if (action === "approve" && p.targetUserId) {
      const target = await this.prisma.user.findUnique({ where: { id: p.targetUserId } });
      if (target) {
        if (p.type === "BLOCK")        { await this.prisma.user.update({ where: { id: target.id }, data: { status: UserStatus.SUSPENDED } }); await this.killSessions(target.id); executed = "Player suspended."; }
        else if (p.type === "UNBLOCK") { await this.prisma.user.update({ where: { id: target.id }, data: { status: UserStatus.ACTIVE } });    executed = "Player re-activated."; }
        else if (p.type === "CLOSE_ACCOUNT") { await this.prisma.user.update({ where: { id: target.id }, data: { status: UserStatus.CLOSED } }); await this.killSessions(target.id); executed = "Player account closed."; }
        else executed = "Approved — apply the change from the user profile.";
      }
    }

    const verdict = action === "approve" ? "APPROVED" : "REJECTED";
    const body = `Admin ${verdict} this request.${executed ? ` ${executed}` : ""}${note?.trim() ? `\n\nNote: ${note.trim()}` : ""}`;
    await this.prisma.supportMessage.create({ data: { ticketId, authorId: adminId, isAdmin: true, body } });
    await this.prisma.supportTicket.update({ where: { id: ticketId }, data: { status: action === "approve" ? "RESOLVED" : "CLOSED" } });
    await this.audit(adminId, "bookie.request.action", { type: "ticket", id: ticketId }, { action, type: p.type, target: p.targetUserId, executed }, ip);
    return { ok: true, action, executed: executed || null };
  }

  /** Roll up bet count + users' net ledger across a set of user ids. */
  private async rollup(userIds: string[]) {
    if (userIds.length === 0) return { totalBets: 0, usersNet: 0 };
    const [bets, casino, net] = await Promise.all([
      this.prisma.bet.count({ where: { userId: { in: userIds } } }),
      this.prisma.ledgerEntry.count({ where: { userId: { in: userIds }, kind: LedgerKind.CASINO_BET } }),
      this.prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: {
          userId: { in: userIds },
          kind: { in: [LedgerKind.BET_SETTLE_WIN, LedgerKind.BET_SETTLE_LOSS, LedgerKind.CASINO_BET, LedgerKind.CASINO_WIN] },
        },
      }),
    ]);
    return { totalBets: bets + casino, usersNet: round2(num(net._sum.amount)) };
  }
}
