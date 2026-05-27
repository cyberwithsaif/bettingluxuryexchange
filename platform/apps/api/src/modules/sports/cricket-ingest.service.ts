import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import axios from "axios";
import { MarketType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CryptoService } from "../../common/crypto/crypto.service";

// The Odds API "group" → our Sport.key. Soccer maps to our "football".
const SPORT_GROUP_MAP: Record<string, string> = {
  Cricket: "cricket",
  Soccer: "football",
  Tennis: "tennis",
  Basketball: "basketball",
};

/**
 * CricAPI ingestion (https://cricapi.com — free tier: 100 hits/day).
 *
 * The API key is read from the admin "API Keys" entry (provider `cricket_api`,
 * field `api_key`); falls back to the CRICKET_API_TOKEN env var. Free CricAPI
 * does not provide betting odds, so imported matches get a "Match Winner"
 * market with default back/lay prices the admin can tune on the Markets page.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class CricketIngestService implements OnModuleInit {
  private readonly logger = new Logger(CricketIngestService.name);
  private readonly base = process.env.CRICKET_API_BASE ?? "https://api.cricapi.com";
  private readonly oddsBase = process.env.ODDS_API_BASE ?? "https://api.the-odds-api.com/v4";

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Auto-sync loop. Runs only on PM2 worker 0 (so the cluster doesn't multiply
   * API calls) and only when ODDS_SYNC_HOURS > 0. Keeps a small per-sport cap
   * to respect the free 500/month quota — tune ODDS_SYNC_HOURS or upgrade the
   * plan for more frequent live refreshes.
   */
  onModuleInit() {
    const hours = Number(process.env.ODDS_SYNC_HOURS ?? 12);
    const instance = process.env.NODE_APP_INSTANCE ?? "0";
    if (hours <= 0 || instance !== "0") return;
    const ms = hours * 3600_000;
    const tick = async () => {
      try {
        if (!(await this.getOddsApiKey())) return; // no key yet — skip silently
        const r = await this.syncFromOddsApi({ perSportCap: Number(process.env.ODDS_SYNC_CAP ?? 2) });
        this.logger.log(`Auto-sync: ${r.synced} matches (live ${r.live}, upcoming ${r.upcoming})`);
      } catch (e: any) {
        this.logger.warn(`Auto-sync failed: ${e?.message ?? e}`);
      }
    };
    setTimeout(tick, 30_000);          // first run shortly after boot
    setInterval(tick, ms);             // then every ODDS_SYNC_HOURS
    this.logger.log(`Odds auto-sync enabled: every ${hours}h (worker 0)`);
  }

  /** Resolve The Odds API key: admin API-Keys entry (the_odds_api) first, then env. */
  private async getOddsApiKey(): Promise<string> {
    try {
      const row = await this.prisma.apiKey.findUnique({ where: { providerKey: "the_odds_api" } });
      if (row?.enabled) {
        const plain = JSON.parse(this.crypto.decrypt(row.ciphertext, row.iv, row.authTag)) as Record<string, string>;
        if (plain.api_key) return plain.api_key.trim();
      }
    } catch { /* fall through */ }
    return (process.env.THE_ODDS_API_KEY ?? "").trim();
  }

  /** Upsert one event into a Match + "Match Winner" market with real h2h odds. */
  private async importEvent(sportId: string, ev: any): Promise<"LIVE" | "UPCOMING" | null> {
    const home = ev.home_team; const away = ev.away_team;
    if (!home || !away) return null;
    const commence = ev.commence_time ? new Date(ev.commence_time) : new Date();
    const started = commence.getTime() <= Date.now();
    const status = started ? "LIVE" : "UPCOMING";
    const name = `${home} vs ${away}`;

    const h2h = (ev.bookmakers ?? [])[0]?.markets?.find((m: any) => m.key === "h2h");
    const outcomes: Array<{ name: string; price: number }> = h2h?.outcomes ?? [];

    const match = await this.prisma.match.upsert({
      where: { externalId: ev.id },
      create: { externalId: ev.id, sportId, name, homeTeam: home, awayTeam: away, startTime: commence, status: status as any, inplay: started },
      update: { name, status: status as any, inplay: started, startTime: commence },
    });

    const runnerDefs = (outcomes.length ? outcomes : [{ name: home, price: 2 }, { name: away, price: 2 }]).map((o, i) => {
      const back = round2(o.price && o.price > 1 ? o.price : 2);
      const lay = round2(back + Math.max(0.02, back * 0.02));
      return { name: o.name, sortOrder: i + 1, backPrices: [back], layPrices: [lay] };
    });

    const existing = await this.prisma.market.findFirst({ where: { matchId: match.id, type: MarketType.MATCH_ODDS } });
    if (!existing) {
      await this.prisma.market.create({
        data: { matchId: match.id, type: MarketType.MATCH_ODDS, name: "Match Winner", status: "OPEN" as any, runners: { create: runnerDefs } },
      });
    } else {
      await this.prisma.market.update({ where: { id: existing.id }, data: { status: "OPEN" as any } });
      const runners = await this.prisma.runner.findMany({ where: { marketId: existing.id } });
      for (const r of runners) {
        const def = runnerDefs.find((d) => d.name === r.name);
        if (def) await this.prisma.runner.update({ where: { id: r.id }, data: { backPrices: def.backPrices, layPrices: def.layPrices } });
      }
    }
    return status;
  }

  /**
   * Import real matches WITH real bookmaker odds from The Odds API across
   * cricket, football (soccer), tennis and basketball. Each event becomes a
   * bettable "Match Winner" market. `perSportCap` limits competitions per sport
   * to respect the free 500/month quota.
   */
  async syncFromOddsApi(opts: { perSportCap?: number; groups?: string[] } = {}) {
    const key = await this.getOddsApiKey();
    if (!key) {
      throw new BadRequestException("No 'The Odds API' key configured. Get a free key at the-odds-api.com and add it under Admin → API Keys → 'The Odds API'.");
    }
    const perSportCap = opts.perSportCap ?? 3;
    const wantGroups = opts.groups ?? Object.keys(SPORT_GROUP_MAP);

    // List sports (free, no quota) → active competitions grouped by our sport.
    const { data: sportsList } = await axios.get(`${this.oddsBase}/sports`, { params: { apiKey: key }, timeout: 15_000 });
    if (sportsList?.message) throw new BadRequestException(`The Odds API: ${sportsList.message}`);
    const active: any[] = (Array.isArray(sportsList) ? sportsList : []).filter((s: any) => s.active);

    let synced = 0, live = 0, upcoming = 0;
    const perSport: Record<string, number> = {};

    for (const group of wantGroups) {
      const ourKey = SPORT_GROUP_MAP[group];
      if (!ourKey) continue;
      const sport = await this.prisma.sport.findUnique({ where: { key: ourKey } });
      if (!sport) continue;
      const comps = active.filter((s) => s.group === group).map((s) => s.key).slice(0, perSportCap);

      for (const sk of comps) {
        let events: any[] = [];
        try {
          const { data } = await axios.get(`${this.oddsBase}/sports/${sk}/odds`, {
            params: { apiKey: key, regions: "uk,eu", markets: "h2h", oddsFormat: "decimal" },
            timeout: 15_000,
          });
          events = Array.isArray(data) ? data : [];
        } catch { continue; }
        for (const ev of events) {
          const st = await this.importEvent(sport.id, ev);
          if (st) { synced++; perSport[ourKey] = (perSport[ourKey] ?? 0) + 1; if (st === "LIVE") live++; else upcoming++; }
        }
      }
    }
    this.logger.log(`Odds API sync: ${synced} matches (live ${live}, upcoming ${upcoming}) — ${JSON.stringify(perSport)}`);
    return { synced, live, upcoming, byKey: perSport };
  }

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
