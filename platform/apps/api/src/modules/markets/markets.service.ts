import { Injectable, NotFoundException } from "@nestjs/common";
import { MarketStatus, MarketType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RedisService } from "../../common/redis/redis.service";

@Injectable()
export class MarketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  listSports() {
    return this.prisma.sport.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  }

  async listMatches(sportKey?: string, inplayOnly = false) {
    const where: Prisma.MatchWhereInput = {
      status: { in: inplayOnly ? ["LIVE"] : ["UPCOMING", "LIVE"] },
      ...(sportKey ? { sport: { key: sportKey } } : {}),
    };
    return this.prisma.match.findMany({
      where,
      orderBy: { startTime: "asc" },
      include: {
        sport: true,
        competition: true,
        markets: {
          where: { type: MarketType.MATCH_ODDS },
          include: { runners: true },
        },
      },
      take: 100,
    });
  }

  async getMatch(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        sport: true,
        competition: true,
        markets: { include: { runners: { orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (!match) throw new NotFoundException("Match not found");
    return match;
  }

  async getMarket(id: string) {
    const market = await this.prisma.market.findUnique({
      where: { id },
      include: { runners: { orderBy: { sortOrder: "asc" } }, match: true },
    });
    if (!market) throw new NotFoundException("Market not found");
    return market;
  }

  /**
   * Update odds for a runner. Called by the provider-feed ingestion or by
   * the admin manual-odds form. Publishes an `odds.<marketId>` Redis event
   * which the websocket gateway fans out to subscribed clients.
   */
  async setRunnerOdds(opts: {
    runnerId: string;
    backPrices: number[];
    layPrices: number[];
    backSize?: number[];
    laySize?: number[];
  }) {
    const r = await this.prisma.runner.update({
      where: { id: opts.runnerId },
      data: {
        backPrices: opts.backPrices as unknown as Prisma.InputJsonValue,
        layPrices:  opts.layPrices  as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, marketId: true, name: true },
    });
    await this.redis.publish(`odds.${r.marketId}`, {
      marketId: r.marketId,
      runnerId: r.id,
      back: opts.backPrices,
      lay:  opts.layPrices,
      backSize: opts.backSize ?? [],
      laySize: opts.laySize ?? [],
      ts: Date.now(),
    });
    return r;
  }

  async setMarketStatus(marketId: string, status: MarketStatus) {
    const m = await this.prisma.market.update({ where: { id: marketId }, data: { status } });
    await this.redis.publish(`market.${marketId}`, { marketId, status });
    return m;
  }
}
