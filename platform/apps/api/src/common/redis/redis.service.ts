import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from "@nestjs/common";
import Redis from "ioredis";

/**
 * Two Redis clients are exposed:
 *  - `client`      : general read/write (cache, atomic ops)
 *  - `subscriber`  : dedicated pub/sub subscriber (ioredis requires a
 *                    separate connection when in subscribe mode)
 *
 * Live odds updates flow: provider → OddsService → Redis pub channel
 *   `odds.<marketId>` → RealtimeGateway → socket.io room.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client!: Redis;
  public subscriber!: Redis;
  public publisher!: Redis;

  onModuleInit() {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    this.client = new Redis(url, { maxRetriesPerRequest: null });
    this.subscriber = new Redis(url, { maxRetriesPerRequest: null });
    this.publisher = new Redis(url, { maxRetriesPerRequest: null });
    this.client.on("connect", () => this.logger.log("Redis connected"));
    this.client.on("error", (e) => this.logger.error(`Redis error: ${e.message}`));
  }

  async onModuleDestroy() {
    await Promise.all([
      this.client?.quit(),
      this.subscriber?.quit(),
      this.publisher?.quit(),
    ]);
  }

  async publish(channel: string, payload: unknown) {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }
}
