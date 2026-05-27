import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { MarketType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CryptoService } from "../../common/crypto/crypto.service";

/**
 * Betfair Exchange (Betting API) ingestion — authentic back/lay match odds.
 *
 * Reads credentials from the admin API-Keys entry `betfair_exchange`
 * (fields: app_key, session_token). Session tokens expire (typically daily),
 * so a clear error is surfaced when the session is invalid — refresh the token
 * in API Keys and re-sync. Cricket eventTypeId is "4" on Betfair.
 *
 * NOTE: This adapter follows the documented Betfair Betting REST API; it is
 * validated live once a real app key + session token are configured.
 */
@Injectable()
export class BetfairIngestService {
  private readonly logger = new Logger(BetfairIngestService.name);
  private readonly base = process.env.BETFAIR_API_BASE ?? "https://api.betfair.com/exchange/betting/rest/v1.0";
  private readonly cricketEventType = process.env.BETFAIR_CRICKET_EVENTTYPE ?? "4";

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private async creds(): Promise<{ appKey: string; sessionToken: string }> {
    const row = await this.prisma.apiKey.findUnique({ where: { providerKey: "betfair_exchange" } });
    if (!row?.enabled) {
      throw new BadRequestException("Betfair not configured. Add app_key + session_token under Admin → API Keys → 'Betfair Exchange'.");
    }
    const f = JSON.parse(this.crypto.decrypt(row.ciphertext, row.iv, row.authTag)) as Record<string, string>;
    const appKey = (f.app_key ?? "").trim();
    const sessionToken = (f.session_token ?? "").trim();
    if (!appKey || !sessionToken) throw new BadRequestException("Betfair app_key and session_token are both required.");
    return { appKey, sessionToken };
  }

  private async call<T>(method: string, body: unknown, appKey: string, sessionToken: string): Promise<T> {
    const { data } = await axios.post(`${this.base}/${method}/`, body, {
      headers: { "X-Application": appKey, "X-Authentication": sessionToken, "Content-Type": "application/json", "Accept": "application/json" },
      timeout: 20_000,
    });
    // Betfair returns a JSON-RPC-style fault on auth/usage errors.
    if (data?.faultcode || data?.detail || data?.error) {
      const msg = data?.detail?.APINGException?.errorCode ?? data?.faultstring ?? "request failed";
      throw new BadRequestException(`Betfair: ${msg}`);
    }
    return data as T;
  }

  /** Pull cricket MATCH_ODDS markets + live back/lay prices and persist them. */
  async syncCricketMatchOdds() {
    const { appKey, sessionToken } = await this.creds();
    const sport = await this.prisma.sport.findUnique({ where: { key: "cricket" } });
    if (!sport) throw new BadRequestException("Cricket sport not seeded");

    // 1. Catalogue: which markets exist + runner names + event info.
    const catalogue = await this.call<any[]>("listMarketCatalogue", {
      filter: { eventTypeIds: [this.cricketEventType], marketTypeCodes: ["MATCH_ODDS"] },
      maxResults: 50,
      marketProjection: ["EVENT", "COMPETITION", "RUNNER_DESCRIPTION", "MARKET_START_TIME"],
    }, appKey, sessionToken);

    if (!Array.isArray(catalogue) || !catalogue.length) {
      return { synced: 0, live: 0, upcoming: 0, note: "No cricket Match Odds markets available right now." };
    }

    // 2. Prices for those markets.
    const marketIds = catalogue.map((m) => m.marketId).slice(0, 100);
    const books = await this.call<any[]>("listMarketBook", {
      marketIds,
      priceProjection: { priceData: ["EX_BEST_OFFERS"], virtualise: true },
    }, appKey, sessionToken);
    const bookById = new Map<string, any>((books ?? []).map((b) => [b.marketId, b]));

    let synced = 0, live = 0, upcoming = 0;
    for (const m of catalogue) {
      const book = bookById.get(m.marketId);
      const event = m.event ?? {};
      const runnersCat: any[] = m.runners ?? [];
      if (runnersCat.length < 2) continue;

      const start = m.marketStartTime ? new Date(m.marketStartTime) : (event.openDate ? new Date(event.openDate) : new Date());
      const inplay = !!book?.inplay;
      const status = inplay ? "LIVE" : "UPCOMING";
      const name = event.name ?? runnersCat.map((r) => r.runnerName).join(" v ");
      const home = runnersCat[0]?.runnerName ?? "Home";
      const away = runnersCat[1]?.runnerName ?? "Away";

      const match = await this.prisma.match.upsert({
        where: { externalId: `betfair:${event.id ?? m.marketId}` },
        create: { externalId: `betfair:${event.id ?? m.marketId}`, sportId: sport.id, name, homeTeam: home, awayTeam: away, startTime: start, status: status as any, inplay },
        update: { name, status: status as any, inplay, startTime: start },
      });

      // Market status from the book (OPEN / SUSPENDED / CLOSED).
      const mkStatus = book?.status === "SUSPENDED" ? "SUSPENDED" : book?.status === "CLOSED" ? "CLOSED" : "OPEN";
      const bookRunnerById = new Map<number, any>((book?.runners ?? []).map((r: any) => [r.selectionId, r]));

      const runnerDefs = runnersCat.map((rc, i) => {
        const br = bookRunnerById.get(rc.selectionId);
        const back = (br?.ex?.availableToBack ?? []).slice(0, 3).map((x: any) => Number(x.price)).filter((n: number) => n > 1);
        const lay = (br?.ex?.availableToLay ?? []).slice(0, 3).map((x: any) => Number(x.price)).filter((n: number) => n > 1);
        return { name: rc.runnerName, sortOrder: rc.sortPriority ?? i + 1, backPrices: back, layPrices: lay };
      });

      const existing = await this.prisma.market.findFirst({ where: { matchId: match.id, type: MarketType.MATCH_ODDS } });
      if (!existing) {
        await this.prisma.market.create({
          data: { matchId: match.id, type: MarketType.MATCH_ODDS, name: "Match Odds", status: mkStatus as any, externalId: m.marketId, runners: { create: runnerDefs } },
        });
      } else {
        await this.prisma.market.update({ where: { id: existing.id }, data: { status: mkStatus as any, externalId: m.marketId } });
        const runners = await this.prisma.runner.findMany({ where: { marketId: existing.id } });
        for (const r of runners) {
          const def = runnerDefs.find((d) => d.name === r.name);
          if (def) await this.prisma.runner.update({ where: { id: r.id }, data: { backPrices: def.backPrices, layPrices: def.layPrices } });
        }
      }
      synced++; if (inplay) live++; else upcoming++;
    }
    this.logger.log(`Betfair sync: ${synced} cricket markets (live ${live}, upcoming ${upcoming})`);
    return { synced, live, upcoming };
  }
}
