import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { MarketType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CryptoService } from "../../common/crypto/crypto.service";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * EntitySport Cricket API (https://entitysport.com, India-accessible).
 *
 * Token read from API Keys `entitysport` (field api_token), env fallback
 * ENTITYSPORT_TOKEN. The free DEMO token returns COMPLETED matches only and
 * `odds_available:false`; a paid plan unlocks live/upcoming matches plus the
 * odds + session/fancy feeds. This adapter handles all statuses, and pulls
 * real match-odds + session markets whenever the plan exposes them.
 */
@Injectable()
export class EntitySportIngestService {
  private readonly logger = new Logger(EntitySportIngestService.name);
  private readonly base = process.env.ENTITYSPORT_API_BASE ?? "https://rest.entitysport.com/v2";

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private async getToken(): Promise<string> {
    try {
      const row = await this.prisma.apiKey.findUnique({ where: { providerKey: "entitysport" } });
      if (row?.enabled) {
        const f = JSON.parse(this.crypto.decrypt(row.ciphertext, row.iv, row.authTag)) as Record<string, string>;
        if (f.api_token) return f.api_token.trim();
      }
    } catch { /* fall through */ }
    return (process.env.ENTITYSPORT_TOKEN ?? "").trim();
  }

  private statusOf(s: number): "LIVE" | "UPCOMING" | "ENDED" {
    return s === 3 ? "LIVE" : s === 1 ? "UPCOMING" : "ENDED";
  }

  /** Best-effort: fetch match odds (paid plans) → {teamName: {back,lay}} + session markets. */
  private async fetchOdds(matchId: number, token: string): Promise<{ matchOdds: Record<string, { back: number; lay: number }>; sessions: Array<{ title: string; back: number; lay: number }> } | null> {
    try {
      const { data } = await axios.get(`${this.base}/matches/${matchId}/odds`, { params: { token }, timeout: 12_000 });
      if (data?.status !== "ok") return null;
      const live = data?.response?.live_odds ?? data?.response?.odds ?? data?.response ?? {};
      const matchOdds: Record<string, { back: number; lay: number }> = {};
      const mo = live.matchodds ?? live.match_odds ?? {};
      for (const side of ["teama", "teamb"]) {
        const o = mo[side];
        if (o) matchOdds[side] = { back: Number(o.back ?? o.back_rate ?? 0), lay: Number(o.lay ?? o.lay_rate ?? 0) };
      }
      const sessions: Array<{ title: string; back: number; lay: number }> = [];
      const sess = live.session ?? live.fancy ?? [];
      if (Array.isArray(sess)) for (const s of sess) {
        sessions.push({ title: s.selection ?? s.title ?? "Session", back: Number(s.yes_rate ?? s.back ?? 0), lay: Number(s.no_rate ?? s.lay ?? 0) });
      }
      return { matchOdds, sessions };
    } catch { return null; }
  }

  /** Fetch matches for a specific status (3=live, 1=upcoming, 2=completed), paging up to `maxPages`. */
  private async fetchByStatus(token: string, status: number, maxPages: number): Promise<any[]> {
    const out: any[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const { data } = await axios.get(`${this.base}/matches/`, { params: { token, per_page: 50, status, paged: page }, timeout: 15_000 });
      if (data?.status !== "ok") {
        if (page === 1 && status === 3) {
          // surface auth/plan errors only on the first (live) request
          throw new BadRequestException(`EntitySport: ${typeof data?.response === "string" ? data.response : (data?.message ?? "request failed")}`);
        }
        break;
      }
      const its = data?.response?.items ?? [];
      out.push(...its);
      if (its.length < 50) break;
    }
    return out;
  }

  /** Two-tier back/lay prices around a quoted best back/lay (fills the exchange grid). */
  private priceTiers(back: number, lay: number): { backPrices: number[]; layPrices: number[] } {
    const b = back > 1.01 ? back : 1.95;
    const l = lay > 1.01 ? lay : 1.97;
    return {
      backPrices: [round2(b), round2(b - 0.01)],
      layPrices: [round2(l), round2(l + 0.01)],
    };
  }

  /**
   * Create a market if missing, else keep it in sync. Prices are only
   * overwritten when `overwritePrices` is true (i.e. a live feed is the source
   * of truth) — so admin-set odds on default markets survive re-syncs.
   */
  private async ensureMarket(
    matchId: string,
    type: MarketType,
    name: string,
    status: string,
    overwritePrices: boolean,
    runnerDefs: Array<{ name: string; sortOrder: number; backPrices: number[]; layPrices: number[] }>,
  ) {
    const existing = await this.prisma.market.findFirst({ where: { matchId, type, name } });
    if (!existing) {
      await this.prisma.market.create({ data: { matchId, type, name, status: status as any, runners: { create: runnerDefs } } });
      return;
    }
    await this.prisma.market.update({ where: { id: existing.id }, data: { status: status as any } });
    if (!overwritePrices) return; // preserve admin-tuned odds on default (non-feed) markets
    const runners = await this.prisma.runner.findMany({ where: { marketId: existing.id } });
    for (const def of runnerDefs) {
      const r = runners.find((x) => x.name === def.name);
      if (r) await this.prisma.runner.update({ where: { id: r.id }, data: { backPrices: def.backPrices, layPrices: def.layPrices } });
      else await this.prisma.runner.create({ data: { marketId: existing.id, name: def.name, sortOrder: def.sortOrder, backPrices: def.backPrices, layPrices: def.layPrices } });
    }
  }

  async syncMatches() {
    const token = await this.getToken();
    if (!token) throw new BadRequestException("No EntitySport token configured. Add it under Admin → API Keys → 'EntitySport Cricket'.");
    const sport = await this.prisma.sport.findUnique({ where: { key: "cricket" } });
    if (!sport) throw new BadRequestException("Cricket sport not seeded");

    // Pull LIVE + UPCOMING explicitly — the default /matches feed returns
    // historical (completed) fixtures first, so we must filter by status.
    const liveMatches = await this.fetchByStatus(token, 3, 2);     // all in-play
    const upcomingMatches = await this.fetchByStatus(token, 1, 1);  // next page of upcoming (~50)
    const byId = new Map<number, any>();
    for (const m of [...liveMatches, ...upcomingMatches]) if (m?.match_id != null) byId.set(m.match_id, m);
    const items = [...byId.values()].slice(0, 80);

    let synced = 0, live = 0, upcoming = 0, completed = 0;
    for (const m of items) {
      const home = m.teama?.name; const away = m.teamb?.name;
      if (!home || !away) continue;
      const status = this.statusOf(Number(m.status));
      const startTime = m.date_start ? new Date(String(m.date_start).replace(" ", "T") + "Z")
        : (m.date_start_ist ? new Date(m.date_start_ist) : new Date());
      const name = m.title || `${home} vs ${away}`;

      const match = await this.prisma.match.upsert({
        where: { externalId: `entitysport:${m.match_id}` },
        create: { externalId: `entitysport:${m.match_id}`, sportId: sport.id, name, homeTeam: home, awayTeam: away, startTime: isNaN(+startTime) ? new Date() : startTime, status: status as any, inplay: status === "LIVE" },
        update: { name, status: status as any, inplay: status === "LIVE" },
      });

      // Real exchange odds when the feed exposes them (odds_available=true,
      // in-play); otherwise operator-set defaults the admin tunes on Markets.
      let odds: { matchOdds: Record<string, { back: number; lay: number }>; sessions: Array<{ title: string; back: number; lay: number }> } | null = null;
      if (String(m.odds_available) === "true" && status !== "ENDED") odds = await this.fetchOdds(m.match_id, token);

      const moA = odds?.matchOdds?.teama; const moB = odds?.matchOdds?.teamb;
      const hasFeed = !!((moA?.back ?? 0) > 1 || (moB?.back ?? 0) > 1);
      const mkStatus = status === "ENDED" ? "CLOSED" : "OPEN";
      const limited = !/test|first.?class/i.test(String(m.format_str ?? ""));

      // Match Odds — back/lay with two tiers; feed prices override when live.
      await this.ensureMarket(match.id, MarketType.MATCH_ODDS, "Match Odds", mkStatus, hasFeed, [
        { name: home, sortOrder: 1, ...this.priceTiers(moA?.back ?? 1.95, moA?.lay ?? 1.97) },
        { name: away, sortOrder: 2, ...this.priceTiers(moB?.back ?? 1.95, moB?.lay ?? 1.97) },
      ]);

      // Bookmaker — wider spread than the exchange market.
      await this.ensureMarket(match.id, MarketType.BOOKMAKER, "Bookmaker", mkStatus, false, [
        { name: home, sortOrder: 1, ...this.priceTiers((moA?.back ?? 1.95) - 0.03, (moA?.lay ?? 1.97) + 0.03) },
        { name: away, sortOrder: 2, ...this.priceTiers((moB?.back ?? 1.95) - 0.03, (moB?.lay ?? 1.97) + 0.03) },
      ]);

      // Toss Winner — even-money two-way.
      await this.ensureMarket(match.id, MarketType.TOSS, "Toss Winner", mkStatus, false, [
        { name: home, sortOrder: 1, ...this.priceTiers(1.95, 1.97) },
        { name: away, sortOrder: 2, ...this.priceTiers(1.95, 1.97) },
      ]);

      // Tied Match — limited-overs formats only.
      if (limited) {
        await this.ensureMarket(match.id, MarketType.TIED_MATCH, "Tied Match", mkStatus, false, [
          { name: "Yes", sortOrder: 1, ...this.priceTiers(8.0, 8.6) },
          { name: "No", sortOrder: 2, ...this.priceTiers(1.08, 1.11) },
        ]);
      }

      // Session/fancy — ONLY from the live feed; never fabricated.
      if (odds?.sessions?.length) {
        for (const s of odds.sessions.slice(0, 16)) {
          if (s.back > 0) {
            await this.ensureMarket(match.id, MarketType.SESSION, s.title, "OPEN", true, [
              { name: "Yes", sortOrder: 1, ...this.priceTiers(s.back, s.lay || s.back) },
            ]);
          }
        }
      }
      synced++; if (status === "LIVE") live++; else if (status === "UPCOMING") upcoming++; else completed++;
    }

    const note = !live && !upcoming
      ? "No live or upcoming cricket from EntitySport right now. Exchange odds attach to a fixture only once its market goes active (near/at start)."
      : (live + upcoming > 0 && !items.some((m: any) => String(m.odds_available) === "true")
          ? "Live/upcoming matches imported. Exchange back/lay + session odds will populate automatically when each fixture's odds feed activates."
          : undefined);
    this.logger.log(`EntitySport sync: ${synced} matches (live ${live}, upcoming ${upcoming}, completed ${completed})`);
    return { synced, live, upcoming, completed, note };
  }
}
