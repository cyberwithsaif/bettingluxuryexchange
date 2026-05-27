import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { CasinoCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CryptoService } from "../../common/crypto/crypto.service";

/**
 * SlotsLaunch integration (https://slotslaunch.com — free demo-slot catalogue).
 *
 * Free, self-serve API: register your domain at slotslaunch.com/launch-pad/api,
 * get a token, and query 32k+ real provider demo games. Games run in DEMO/fun
 * mode (no real-money wagering through the provider) and launch via an iframe
 * locked to the registered domain.
 *
 * Model: we SYNC their catalogue into our own CasinoGame/CasinoProvider tables
 * (the docs recommend syncing, not live per-request), then serve from the DB.
 * The token + host come from API Keys `slotslaunch` (fields token, host) with
 * env fallback SLOTSLAUNCH_TOKEN / SLOTSLAUNCH_HOST.
 */
@Injectable()
export class SlotsLaunchService {
  private readonly logger = new Logger(SlotsLaunchService.name);
  private readonly base = process.env.SLOTSLAUNCH_API_BASE ?? "https://slotslaunch.com/api";
  private readonly embedBase = "https://slotslaunch.com/iframe";

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private async getCreds(): Promise<{ token: string; host: string }> {
    try {
      const row = await this.prisma.apiKey.findUnique({ where: { providerKey: "slotslaunch" } });
      if (row?.enabled) {
        const f = JSON.parse(this.crypto.decrypt(row.ciphertext, row.iv, row.authTag)) as Record<string, string>;
        if (f.token) return { token: f.token.trim(), host: (f.host || "").trim() || (process.env.SLOTSLAUNCH_HOST ?? "") };
      }
    } catch { /* fall through to env */ }
    return { token: (process.env.SLOTSLAUNCH_TOKEN ?? "").trim(), host: (process.env.SLOTSLAUNCH_HOST ?? "").trim() };
  }

  /** Host header SlotsLaunch validates the token against (the registered domain). */
  private originHeaders(host: string): Record<string, string> {
    const h = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!h) return {};
    return { Origin: `https://${h}`, Referer: `https://${h}/` };
  }

  private categoryOf(type: string): CasinoCategory {
    const t = (type || "").toLowerCase();
    if (t.includes("live")) return CasinoCategory.LIVE;
    if (t.includes("table") || t.includes("card") || t.includes("roulette") || t.includes("black")) return CasinoCategory.TABLE;
    if (t.includes("crash") || t.includes("instant") || t.includes("arcade")) return CasinoCategory.CRASH;
    if (t.includes("lottery") || t.includes("keno") || t.includes("bingo")) return CasinoCategory.LOTTERY;
    if (t.includes("virtual")) return CasinoCategory.VIRTUAL;
    return CasinoCategory.SLOT;
  }

  private slug(s: string): string {
    return (s || "provider").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "provider";
  }

  /** Pull a string from a field that may be a string, {name}, or [{name}]. */
  private nameOf(v: any, fallback: string): string {
    if (!v) return fallback;
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return this.nameOf(v[0], fallback);
    return v.name ?? v.title ?? fallback;
  }

  /**
   * Sync the catalogue into CasinoGame/CasinoProvider. Caps pages to respect
   * rate limits; raise SLOTSLAUNCH_MAX_PAGES for a larger library.
   */
  async syncGames(): Promise<{ synced: number; providers: number; pages: number; note?: string }> {
    const { token, host } = await this.getCreds();
    if (!token) {
      throw new BadRequestException(
        "No SlotsLaunch token. Sign up free at slotslaunch.com/launch-pad/api, register your domain, then add the token under Admin → API Keys → 'SlotsLaunch'.",
      );
    }
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", ...this.originHeaders(host) };
    const maxPages = Number(process.env.SLOTSLAUNCH_MAX_PAGES ?? 40); // ~6000 games at 150/page
    const providerCache = new Map<string, string>(); // slug -> providerId

    let synced = 0, page = 1, pagesDone = 0;
    for (; page <= maxPages; page++) {
      let data: any;
      try {
        const res = await axios.get(`${this.base}/games`, {
          headers,
          params: { token, page, per_page: 150, published: 1, order_by: "name", order: "asc" },
          timeout: 25_000,
        });
        data = res.data;
      } catch (e: any) {
        const msg = e?.response?.data?.error ?? e?.message ?? "request failed";
        if (page === 1) throw new BadRequestException(`SlotsLaunch: ${msg}`);
        this.logger.warn(`SlotsLaunch page ${page} failed: ${msg}`);
        break;
      }
      if (data?.error) {
        if (page === 1) throw new BadRequestException(`SlotsLaunch: ${data.error}`);
        break;
      }
      const items: any[] = data?.data ?? data?.games ?? [];
      if (!items.length) break;
      pagesDone++;

      for (const g of items) {
        const extId = String(g.id ?? g.game_id ?? "");
        if (!extId) continue;
        const name = g.name ?? g.title ?? `Game ${extId}`;
        const providerName = this.nameOf(g.provider, "SlotsLaunch");
        const typeName = this.nameOf(g.type, "Slots");
        const thumb = g.thumb ?? g.thumbnail ?? g.image ?? g.banner ?? g.icon ?? null;

        // Resolve / create the provider (cached per sync).
        const pSlug = `sl_${this.slug(providerName)}`;
        let providerId = providerCache.get(pSlug);
        if (!providerId) {
          const prov = await this.prisma.casinoProvider.upsert({
            where: { key: pSlug },
            create: { key: pSlug, name: providerName, isActive: true },
            update: { name: providerName, isActive: true },
          });
          providerId = prov.id;
          providerCache.set(pSlug, providerId);
        }

        await this.prisma.casinoGame.upsert({
          where: { providerId_externalId: { providerId, externalId: extId } },
          create: {
            providerId, externalId: extId, name,
            category: this.categoryOf(typeName),
            thumbnail: thumb, isLive: this.categoryOf(typeName) === CasinoCategory.LIVE,
            isActive: true, sortOrder: 0,
          },
          update: { name, thumbnail: thumb, category: this.categoryOf(typeName), isActive: true },
        });
        synced++;
      }

      if (items.length < 150) break; // last page
    }

    this.logger.log(`SlotsLaunch sync: ${synced} games across ${providerCache.size} providers (${pagesDone} pages)`);
    return { synced, providers: providerCache.size, pages: pagesDone, note: synced === 0 ? "No games returned — check the token/domain in API Keys." : undefined };
  }

  /** Build the domain-locked iframe launch URL for a synced game. */
  async launchUrl(gameId: string): Promise<{ url: string; name: string; provider: string }> {
    const game = await this.prisma.casinoGame.findUnique({ where: { id: gameId }, include: { provider: true } });
    if (!game?.isActive) throw new BadRequestException("Game not found");
    if (!game.provider.key.startsWith("sl_")) throw new BadRequestException("Game is not a SlotsLaunch title");
    const { token } = await this.getCreds();
    if (!token) throw new BadRequestException("SlotsLaunch token not configured");
    return {
      url: `${this.embedBase}/${game.externalId}?token=${encodeURIComponent(token)}`,
      name: game.name,
      provider: game.provider.name,
    };
  }
}
