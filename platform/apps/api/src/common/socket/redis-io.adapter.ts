import { IoAdapter } from "@nestjs/platform-socket.io";
import { INestApplicationContext, Logger } from "@nestjs/common";
import { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";

/**
 * Socket.io adapter backed by Redis pub/sub so room broadcasts and
 * client emits work across all PM2 cluster workers.
 *
 * Two things are different from the default IoAdapter:
 *  1) Each worker gets its own pub+sub Redis clients (separate from the
 *     app-wide RedisService — the adapter manages them itself).
 *  2) Transport is locked to websocket-only. Long-polling falls back to
 *     multiple HTTP requests; without sticky sessions those land on
 *     different workers and the handshake never completes.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private pubClient!: Redis;
  private subClient!: Redis;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    this.pubClient = new Redis(url, { maxRetriesPerRequest: null });
    this.subClient = this.pubClient.duplicate();
    await Promise.all([
      new Promise<void>((res) => this.pubClient.once("ready", () => res())),
      new Promise<void>((res) => this.subClient.once("ready", () => res())),
    ]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.logger.log("Socket.io Redis adapter ready");
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      transports: ["websocket"],
    });
    server.adapter(this.adapterConstructor);
    return server;
  }
}
