import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { jwtSecret } from "../jwt-secret";

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient();
      // Only accept the token from the handshake auth payload — never the query
      // string (which can leak via logs/proxies).
      const token = client.handshake?.auth?.token;
      if (!token) {
        this.logger.error("No WS token provided");
        throw new WsException("Unauthorized");
      }

      const payload = this.jwtService.verify(token, { secret: jwtSecret() });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, role: true, status: true, tokenVersion: true },
      });

      if (!user || user.status !== "ACTIVE") {
        this.logger.error("User not found or inactive");
        throw new WsException("Unauthorized");
      }
      // Same token-version gate as HTTP: a revoked token (logout-all / password
      // change) must not keep a casino socket alive.
      if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
        throw new WsException("Session expired");
      }

      client.user = { userId: user.id, username: user.username, role: user.role };
      return true;
    } catch (err) {
      this.logger.error("WS JWT verification failed");
      throw new WsException("Unauthorized");
    }
  }
}
