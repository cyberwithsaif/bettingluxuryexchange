import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { MarketType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CryptoService } from "../../common/crypto/crypto.service";

/**
 * CricAPI ingestion (https://cricapi.com — free tier: 100 hits/day).
 *
 * The API key is read from the admin "API Keys" entry (provider `cricket_api`,
 * field `api_key`); falls back to the CRICKET_API_TOKEN env var. Free CricAPI
 * does not provide betting odds, so imported matches get a "Match Winner"
 * market with default back/lay prices the admin can tune on the Markets page.
 */
@Injectable()
export class CricketIngestService {
  private readonly logger = new Logger(CricketIngestService.name);
  private readonly base = process.env.CRICKET_API_BASE ?? "https://api.cricapi.com";

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Resolve the CricAPI key: admin API-Keys entry first, then env fallback. */
  private async getToken(): Promise<string> {
    try {
      const row = await this.prisma.apiKey.findUnique({ where: { providerKey: "cricket_api" } });
      if (row?.enabled) {
        const plain = JSON.parse(this.crypto.decrypt(row.ciphertext, row.iv, row.authTag)) as Record<string, string>;
        if (plain.api_key) return plain.api_key.trim();
      }
    } catch { /* fall through to env */ }
    return (process.env.CRICKET_API_TOKEN ?? "").trim();
  }

  private async fetchList(path: string, token: string): Promise<any[]> {
    const { data } = await axios.get(`${this.base}/v1/${path}`, { params: { apikey: token, offset: 0 }, timeout: 15_000 });
    if (data?.status === "failure") {
      throw new BadRequestException(`Cricket API: ${data.reason ?? "request failed"}`);
    }
    return Array.isArray(data?.data) ? data.data : [];
  }

  /**
   * Import real live + upcoming matches and make them bettable: each gets a
   * "Match Winner" MATCH_ODDS market (OPEN for LIVE/UPCOMING) with the two
   * teams as runners. Ended matches are imported with a CLOSED market.
   */
  async syncLiveMatches() {
    const token = await this.getToken();
    if (!token) {
      throw new BadRequestException("No Cricket API key configured. Add one under Admin → API Keys → 'Cricket API (cricapi)' (free key at cricapi.com).");
    }
    const sport = await this.prisma.sport.findUnique({ where: { key: "cricket" } });
    if (!sport) throw new BadRequestException("Cricket sport not seeded");

    const current = await this.fetchList("currentMatches", token);
    let upcoming: any[] = [];
    try { upcoming = await this.fetchList("matches", token); } catch { /* matches endpoint optional */ }

    const byId = new Map<string, any>();
    for (const m of [...current, ...upcoming]) if (m?.id) byId.set(m.id, m);

    let synced = 0, live = 0, upcomingCount = 0;
    for (const m of byId.values()) {
      const teams: string[] = m.teams ?? (m.teamInfo ?? []).map((t: any) => t?.name).filter(Boolean);
      const home = teams[0]; const away = teams[1];
      if (!home || !away) continue; // need both teams to form a market

      const started = !!m.matchStarted;
      const ended = !!m.matchEnded;
      const status = ended ? "ENDED" : started ? "LIVE" : "UPCOMING";
      const startTime = m.dateTimeGMT ? new Date(m.dateTimeGMT) : (m.date ? new Date(m.date) : new Date());
      const name = m.name ?? `${home} vs ${away}`;

      const match = await this.prisma.match.upsert({
        where: { externalId: m.id },
        create: { externalId: m.id, sportId: sport.id, name, homeTeam: home, awayTeam: away, startTime, status: status as any, inplay: status === "LIVE" },
        update: { name, status: status as any, inplay: status === "LIVE", startTime },
      });

      const mkStatus = ended ? "CLOSED" : "OPEN";
      const existing = await this.prisma.market.findFirst({ where: { matchId: match.id, type: MarketType.MATCH_ODDS } });
      if (!existing) {
        await this.prisma.market.create({
          data: {
            matchId: match.id, type: MarketType.MATCH_ODDS, name: "Match Winner", status: mkStatus as any,
            runners: {
              create: [
                { name: home, sortOrder: 1, backPrices: [1.95, 1.94, 1.93], layPrices: [1.97, 1.98, 1.99] },
                { name: away, sortOrder: 2, backPrices: [1.95, 1.94, 1.93], layPrices: [1.97, 1.98, 1.99] },
              ],
            },
          },
        });
      } else {
        await this.prisma.market.update({ where: { id: existing.id }, data: { status: mkStatus as any } });
      }
      synced++; if (status === "LIVE") live++; else if (status === "UPCOMING") upcomingCount++;
    }
    this.logger.log(`Synced ${synced} cricket matches (live ${live}, upcoming ${upcomingCount})`);
    return { synced, live, upcoming: upcomingCount };
  }

  /** Fetch competitions (series) and persist as Competition rows. */
  async syncSeries() {
    const token = await this.getToken();
    if (!token) throw new BadRequestException("No Cricket API key configured.");
    const sport = await this.prisma.sport.findUnique({ where: { key: "cricket" } });
    if (!sport) throw new BadRequestException("Cricket sport not seeded");

    const items = await this.fetchList("series", token);
    let count = 0;
    for (const s of items.slice(0, 50)) {
      await this.prisma.competition.upsert({
        where: { externalId: s.id },
        create: { externalId: s.id, name: s.name, sportId: sport.id, startDate: s.startDate ? new Date(s.startDate) : null, endDate: s.endDate ? new Date(s.endDate) : null },
        update: { name: s.name },
      });
      count++;
    }
    this.logger.log(`Synced ${count} cricket series`);
    return { synced: count };
  }

  /** Fetch a series' matches and persist them with a default Match Odds market. */
  async syncSeriesMatches(seriesId: string) {
    const token = await this.getToken();
    if (!token) throw new BadRequestException("No Cricket API key configured.");
    const competition = await this.prisma.competition.findUnique({ where: { externalId: seriesId } });
    if (!competition) throw new BadRequestException("Series not found — sync series first");

    const { data } = await axios.get(`${this.base}/v1/series_info`, { params: { apikey: token, id: seriesId }, timeout: 15_000 });
    if (data?.status === "failure") throw new BadRequestException(`Cricket API: ${data.reason ?? "request failed"}`);
    const matches: any[] = data?.data?.matchList ?? [];

    let count = 0;
    for (const m of matches.slice(0, 100)) {
      const home = m.teams?.[0] ?? "Team A";
      const away = m.teams?.[1] ?? "Team B";
      const startTime = m.dateTimeGMT ? new Date(m.dateTimeGMT) : new Date(m.date ?? Date.now());
      const ended = !!m.matchEnded;
      const status = ended ? "ENDED" : m.matchStarted ? "LIVE" : "UPCOMING";

      const match = await this.prisma.match.upsert({
        where: { externalId: m.id },
        create: { externalId: m.id, sportId: competition.sportId, competitionId: competition.id, name: m.name ?? `${home} vs ${away}`, homeTeam: home, awayTeam: away, startTime, status: status as any, inplay: status === "LIVE" },
        update: { name: m.name ?? `${home} vs ${away}`, status: status as any, inplay: status === "LIVE" },
      });

      const existing = await this.prisma.market.findFirst({ where: { matchId: match.id, type: MarketType.MATCH_ODDS } });
      if (!existing) {
        await this.prisma.market.create({
          data: {
            matchId: match.id, type: MarketType.MATCH_ODDS, name: "Match Winner", status: (ended ? "CLOSED" : "OPEN") as any,
            runners: { create: [
              { name: home, sortOrder: 1, backPrices: [1.95, 1.94, 1.93], layPrices: [1.97, 1.98, 1.99] },
              { name: away, sortOrder: 2, backPrices: [1.95, 1.94, 1.93], layPrices: [1.97, 1.98, 1.99] },
            ] },
          },
        });
      }
      count++;
    }
    this.logger.log(`Synced ${count} matches for series ${seriesId}`);
    return { synced: count };
  }
}
