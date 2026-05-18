import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { MarketType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * CricAPI demo ingestion.
 *
 * The free demo token only exposes COMPLETED competitions / matches — there
 * is no live-odds stream. We use it to populate the database with realistic
 * historical matches so the rest of the platform (markets, exposure, bets,
 * admin) has data to work against in dev. For production live odds, swap in
 * a real Betfair Stream API integration in the same shape.
 */
@Injectable()
export class CricketIngestService {
  private readonly logger = new Logger(CricketIngestService.name);
  private readonly base = process.env.CRICKET_API_BASE ?? "https://api.cricapi.com";
  private readonly token = process.env.CRICKET_API_TOKEN ?? "";

  constructor(private readonly prisma: PrismaService) {}

  /** Fetch completed competitions (series) and persist as Competition rows. */
  async syncSeries() {
    if (!this.token) {
      this.logger.warn("No CRICKET_API_TOKEN configured");
      return { synced: 0 };
    }
    const sport = await this.prisma.sport.findUnique({ where: { key: "cricket" } });
    if (!sport) throw new Error("Cricket sport not seeded");

    const { data } = await axios.get(`${this.base}/v1/series`, {
      params: { apikey: this.token, offset: 0 },
      timeout: 15_000,
    });
    const items: Array<{ id: string; name: string; startDate?: string; endDate?: string }> = data?.data ?? [];
    let count = 0;
    for (const s of items.slice(0, 50)) {
      await this.prisma.competition.upsert({
        where: { externalId: s.id },
        create: {
          externalId: s.id,
          name: s.name,
          sportId: sport.id,
          startDate: s.startDate ? new Date(s.startDate) : null,
          endDate: s.endDate ? new Date(s.endDate) : null,
        },
        update: { name: s.name },
      });
      count++;
    }
    this.logger.log(`Synced ${count} cricket series`);
    return { synced: count };
  }

  /**
   * Fetch a series' completed matches and persist them as Match rows along
   * with a default MATCH_ODDS market (two runners — team A vs team B). This
   * gives the exchange UI realistic match cards to render.
   */
  async syncSeriesMatches(seriesId: string) {
    if (!this.token) return { synced: 0 };
    const competition = await this.prisma.competition.findUnique({ where: { externalId: seriesId } });
    if (!competition) return { synced: 0 };

    const { data } = await axios.get(`${this.base}/v1/series_info`, {
      params: { apikey: this.token, id: seriesId },
      timeout: 15_000,
    });
    const matches: Array<{
      id: string;
      name: string;
      matchType?: string;
      status?: string;
      venue?: string;
      date?: string;
      dateTimeGMT?: string;
      teams?: string[];
    }> = data?.data?.matchList ?? [];

    let count = 0;
    for (const m of matches.slice(0, 100)) {
      const home = m.teams?.[0] ?? "Team A";
      const away = m.teams?.[1] ?? "Team B";
      const startTime = m.dateTimeGMT ? new Date(m.dateTimeGMT) : new Date(m.date ?? Date.now());

      const match = await this.prisma.match.upsert({
        where: { externalId: m.id },
        create: {
          externalId: m.id,
          sportId: competition.sportId,
          competitionId: competition.id,
          name: m.name ?? `${home} vs ${away}`,
          homeTeam: home,
          awayTeam: away,
          startTime,
          status: "ENDED",
        },
        update: { name: m.name ?? `${home} vs ${away}` },
      });

      const existing = await this.prisma.market.findFirst({
        where: { matchId: match.id, type: MarketType.MATCH_ODDS },
      });
      if (!existing) {
        await this.prisma.market.create({
          data: {
            matchId: match.id,
            type: MarketType.MATCH_ODDS,
            name: "Match Odds",
            runners: {
              create: [
                { name: home, sortOrder: 1, backPrices: [1.85, 1.84, 1.83], layPrices: [1.87, 1.88, 1.89] },
                { name: away, sortOrder: 2, backPrices: [2.05, 2.04, 2.03], layPrices: [2.07, 2.08, 2.10] },
              ],
            },
          },
        });
      }
      count++;
    }
    this.logger.log(`Synced ${count} matches for series ${seriesId}`);
    return { synced: count };
  }
}
