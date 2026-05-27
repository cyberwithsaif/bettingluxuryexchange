import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { UserRole } from "@prisma/client";

const RANK: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  SUPER_MASTER: 60,
  MASTER: 40,
  BOOKIE: 30,
  AGENT: 20,
  USER: 0,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException("Not authenticated");

    const minRank = Math.min(...required.map((r) => RANK[r] ?? 0));
    if ((RANK[user.role as UserRole] ?? 0) < minRank) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
