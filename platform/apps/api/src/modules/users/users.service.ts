import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../common/prisma/prisma.service";

const ROLE_RANK: Record<UserRole, number> = {
  SUPER_ADMIN: 100, ADMIN: 80, SUPER_MASTER: 60, MASTER: 40, AGENT: 20, USER: 0,
};

const CHILD_ROLES: Record<UserRole, UserRole[]> = {
  SUPER_ADMIN: ["ADMIN", "SUPER_MASTER", "MASTER", "AGENT", "USER"],
  ADMIN:       ["SUPER_MASTER", "MASTER", "AGENT", "USER"],
  SUPER_MASTER:["MASTER", "AGENT", "USER"],
  MASTER:      ["AGENT", "USER"],
  AGENT:       ["USER"],
  USER:        [],
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.user.findMany({
      where: {
        parentId: actorId,
        ...(opts.q ? { username: { contains: opts.q, mode: "insensitive" } } : {}),
        ...(opts.role ? { role: opts.role } : {}),
      },
      include: { wallet: true, limits: true },
      orderBy: { createdAt: "desc" },
      take: 200,
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
