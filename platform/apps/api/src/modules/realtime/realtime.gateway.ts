import { Logger, OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import { RedisService } from "../../common/redis/redis.service";

/**
 * Single websocket gateway for live odds, market status, and per-user
 * wallet/exposure pushes.
 *
 * Channels:
 *   odds.<marketId>     → odds:tick events
 *   market.<marketId>   → market:status events
 *   wallet.<userId>     → wallet:update events (private; user joins on auth)
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
  ) {}

  onModuleInit() {
    const sub = this.redis.subscriber;
    sub.psubscribe("odds.*", "market.*", "wallet.*", "announcement");
    sub.on("pmessage", (_pattern, channel, message) => {
      try {
        const payload = JSON.parse(message);
        if (channel.startsWith("odds.")) {
          const marketId = channel.slice("odds.".length);
          this.server.to(`market:${marketId}`).emit("odds:tick", payload);
        } else if (channel.startsWith("market.")) {
          const marketId = channel.slice("market.".length);
          this.server.to(`market:${marketId}`).emit("market:status", payload);
        } else if (channel.startsWith("wallet.")) {
          const userId = channel.slice("wallet.".length);
          this.server.to(`user:${userId}`).emit("wallet:update", payload);
        } else if (channel === "announcement") {
          this.server.emit("announcement", payload);
        }
      } catch (e) {
        this.logger.warn(`Bad pubsub payload on ${channel}: ${(e as Error).message}`);
      }
    });
  }

  async handleConnection(client: Socket) {
    // Optional JWT in the connection auth payload — promotes the socket
    // into a user room for wallet/exposure push.
    const token = (client.handshake.auth?.token as string | undefined) ?? "";
    if (token) {
      try {
        const decoded = this.jwt.verify<{ sub: string }>(token);
        client.data.userId = decoded.sub;
        client.join(`user:${decoded.sub}`);
      } catch {
        // anonymous — odds streaming still permitted
      }
    }
  }

  handleDisconnect(client: Socket) {
    void client;
  }

  @SubscribeMessage("market:subscribe")
  joinMarket(@ConnectedSocket() c: Socket, @MessageBody() marketId: string) {
    if (!marketId || typeof marketId !== "string") return { ok: false };
    c.join(`market:${marketId}`);
    return { ok: true };
  }

  @SubscribeMessage("market:unsubscribe")
  leaveMarket(@ConnectedSocket() c: Socket, @MessageBody() marketId: string) {
    c.leave(`market:${marketId}`);
    return { ok: true };
  }
}
