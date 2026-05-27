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

      // Real odds when the plan exposes them; otherwise sensible defaults.
      let odds: { matchOdds: Record<string, { back: number; lay: number }>; sessions: Array<{ title: string; back: number; lay: number }> } | null = null;
      if (String(m.odds_available) === "true" && status !== "ENDED") odds = await this.fetchOdds(m.match_id, token);

      const moA = odds?.matchOdds?.teama; const moB = odds?.matchOdds?.teamb;
      const runnerDefs = [
        { name: home, sortOrder: 1, backPrices: [round2(moA?.back && moA.back > 1 ? moA.back : 1.95)], layPrices: [round2(moA?.lay && moA.lay > 1 ? moA.lay : 1.97)] },
        { name: away, sortOrder: 2, backPrices: [round2(moB?.back && moB.back > 1 ? moB.back : 1.95)], layPrices: [round2(moB?.lay && moB.lay > 1 ? moB.lay : 1.97)] },
      ];
      const mkStatus = status === "ENDED" ? "CLOSED" : "OPEN";

      const existing = await this.prisma.market.findFirst({ where: { matchId: match.id, type: MarketType.MATCH_ODDS } });
      if (!existing) {
        await this.prisma.market.create({ data: { matchId: match.id, type: MarketType.MATCH_ODDS, name: "Match Odds", status: mkStatus as any, runners: { create: runnerDefs } } });
      } else {
        await this.prisma.market.update({ where: { id: existing.id }, data: { status: mkStatus as any } });
        const runners = await this.prisma.runner.findMany({ where: { marketId: existing.id } });
        for (const r of runners) {
          const def = runnerDefs.find((d) => d.name === r.name);
          if (def) await this.prisma.runner.update({ where: { id: r.id }, data: { backPrices: def.backPrices, layPrices: def.layPrices } });
        }
      }

      // Session/fancy markets when available (paid plans).
      if (odds?.sessions?.length) {
        for (const s of odds.sessions.slice(0, 12)) {
          const exists = await this.prisma.market.findFirst({ where: { matchId: match.id, type: MarketType.SESSION, name: s.title } });
          if (!exists && s.back > 0) {
            await this.prisma.market.create({
              data: { matchId: match.id, type: MarketType.SESSION, name: s.title, status: "OPEN" as any,
                runners: { create: [{ name: "Yes", sortOrder: 1, backPrices: [round2(s.back)], layPrices: [round2(s.lay || s.back)] }] } },
            });
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
