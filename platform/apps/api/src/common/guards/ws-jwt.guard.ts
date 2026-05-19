import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";

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
      const token = client.handshake?.auth?.token || client.handshake?.query?.token;
      if (!token) {
        this.logger.error("No WS token provided");
        throw new WsException("Unauthorized");
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, role: true, status: true },
      });

      if (!user || user.status !== "ACTIVE") {
        this.logger.error("User not found or inactive");
        throw new WsException("Unauthorized");
      }

      client.user = { userId: user.id, username: user.username, role: user.role };
      return true;
    } catch (err) {
      this.logger.error("WS JWT verification failed");
      throw new WsException("Unauthorized");
    }
  }
}
