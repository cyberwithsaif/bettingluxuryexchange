import { Injectable, NestMiddleware, ServiceUnavailableException } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { RedisService } from "../redis/redis.service";
import { PrismaService } from "../prisma/prisma.service";

const CACHE_KEY = "cache:platform:settings";

// Routes always allowed regardless of maintenance mode.
const ALLOW_PREFIXES = [
  "/api/auth/",      // login / register / refresh
  "/api/admin/",     // admin panel (so admin can turn maintenance off)
  "/api/platform/",  // public settings read (used by the web layout check)
  "/socket.io/",     // WebSocket upgrade — middleware blocks HTTP not WS
];

function isAllowed(path: string): boolean {
  return ALLOW_PREFIXES.some(p => path.startsWith(p));
}

// Decode JWT payload without verifying signature — we only need the role
// claim for the maintenance bypass. JwtAuthGuard verifies signature downstream.
function roleFromToken(req: Request): string | null {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return null;
    const b64 = token.split(".")[1];
    if (!b64) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    return (payload?.role as string) ?? null;
  } catch { return null; }
}

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    if (isAllowed(req.path)) return next();

    const maintenance = await this.isMaintenanceOn();
    if (!maintenance) return next();

    // Maintenance is ON — admins still get through.
    const role = roleFromToken(req);
    if (role === "ADMIN" || role === "SUPER_ADMIN") return next();

    throw new ServiceUnavailableException(
      "Site is under maintenance. Please try again later.",
    );
  }

  private async isMaintenanceOn(): Promise<boolean> {
    try {
      const cached = await this.redis.client.get(CACHE_KEY);
      if (cached) {
        return (JSON.parse(cached) as Record<string, unknown>).maintenanceMode === true;
      }
    } catch { /* fall through */ }

    try {
      const row = await this.prisma.systemConfig.findUnique({ where: { key: "platform" } });
      return (row?.value as Record<string, unknown> | null)?.maintenanceMode === true;
    } catch {
      return false; // If DB is unreachable, don't block the site.
    }
  }
}
