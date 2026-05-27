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

  private shapeBookie(b: any) {
    const balance = num(b.wallet?.balance);
    const creditLimit = num(b.creditLimit);
    const creditUsed = balance < 0 ? -balance : 0;
    return {
      ...this.pub(b),
      wallet: b.wallet ? { ...b.wallet, balance, exposure: num(b.wallet.exposure) } : null,
      commissionPct: round2((b.partnershipBps ?? 0) / 100),
      creditLimit,
      creditUsed: round2(creditUsed),
      available: round2(balance + creditLimit),
      totalUsers: b._count?.children ?? 0,
    };
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
    return rows.map((r) => this.shapeBookie(r));
  }

  async createBookie(actorId: string, dto: CreateBookieDto, ip?: string) {
    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) {
      throw new ConflictException("Username taken");
    }
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
        partnershipBps: dto.commissionBps ?? 0,
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
      { username: dto.username, initialBalance: dto.initialBalance ?? 0, commissionBps: dto.commissionBps ?? 0 }, ip);
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
    const b = await this.getBookieOrThrow(bookieId);
    const childIds = (await this.prisma.user.findMany({
      where: { parentId: bookieId }, select: { id: true, status: true },
    }));
    const ids = childIds.map((c) => c.id);
    const stats = await this.rollup(ids);
    const [walletLogs, activity] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { userId: bookieId, kind: { in: [LedgerKind.BOOKIE_RECHARGE, LedgerKind.BOOKIE_TO_USER, LedgerKind.USER_TO_BOOKIE] } },
        orderBy: { createdAt: "desc" }, take: 20,
      }),
      this.prisma.adminLog.findMany({
        where: { OR: [{ actorId: bookieId }, { targetId: bookieId }] },
        orderBy: { createdAt: "desc" }, take: 20,
      }),
    ]);
    return {
      bookie: this.shapeBookie(b),
      stats: { ...stats, totalUsers: ids.length, activeUsers: childIds.filter((c) => c.status === "ACTIVE").length },
      walletLogs,
      activity,
    };
  }

  async walletLogs(bookieId: string) {
    await this.getBookieOrThrow(bookieId);
    return this.prisma.ledgerEntry.findMany({
      where: { userId: bookieId, kind: { in: [LedgerKind.BOOKIE_RECHARGE, LedgerKind.BOOKIE_TO_USER, LedgerKind.USER_TO_BOOKIE] } },
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
    const me = await this.prisma.user.findUnique({ where: { id: bookieId }, include: { wallet: true } });
    if (!me) throw new ForbiddenException();
    const children = await this.prisma.user.findMany({
      where: { parentId: bookieId }, select: { id: true, status: true },
    });
    const ids = children.map((c) => c.id);
    const stats = await this.rollup(ids);

    const balance = num(me.wallet?.balance);
    const creditLimit = num(me.creditLimit);
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
      profitLoss: stats.usersNet * -1,   // platform/bookie view = inverse of users' net
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
    return this.prisma.ledgerEntry.findMany({
      where: { userId: bookieId, kind: { in: [LedgerKind.BOOKIE_RECHARGE, LedgerKind.BOOKIE_TO_USER, LedgerKind.USER_TO_BOOKIE] } },
      orderBy: { createdAt: "desc" }, take: 200,
    });
  }

  async profile(bookieId: string) {
    const me = await this.prisma.user.findUnique({
      where: { id: bookieId },
      include: { wallet: true, limits: true, _count: { select: { children: true } } },
    });
    if (!me) throw new ForbiddenException();
    return this.shapeBookie(me);
  }

  // ── shared ──────────────────────────────────────────────────────────────

  /** A bookie may only act on users they parent. Returns the user row. */
  private async assertOwnsUser(bookieId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.parentId !== bookieId) throw new ForbiddenException("Not your user");
    return user;
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
