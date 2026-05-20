import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { extname, join } from "path";
import { randomBytes } from "crypto";
import { rename, unlink } from "fs/promises";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const multer = require("multer");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp");
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { LedgerKind, MarketStatus, UserRole } from "@prisma/client";
import { AdminService } from "./admin.service";
import { MarketsService } from "../markets/markets.service";
import { WalletService } from "../wallet/wallet.service";
import { SettlementService } from "../settlement/settlement.service";
import { CasinoService } from "../casino/casino.service";
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

class SetOddsDto {
  @IsString() runnerId!: string;
  @IsNumber({}, { each: true }) backPrices!: number[];
  @IsNumber({}, { each: true }) layPrices!: number[];
}

class MarketStatusDto { @IsEnum(MarketStatus) status!: MarketStatus; }

class SettleMarketDto {
  @IsOptional() @IsString() winningRunnerId?: string;
  @IsOptional() @IsInt() fancyActual?: number;
  @IsOptional() @IsBoolean() voidMarket?: boolean;
}

class WalletAdjustDto {
  @IsString() userId!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() note?: string;
}

class BetActionDto {
  @IsIn(["void", "cancel"]) action!: "void" | "cancel";
}

class PlatformSettingsDto {
  @IsOptional() @IsNumber() @Min(1) minStake?: number;
  @IsOptional() @IsNumber() @Min(100) maxStake?: number;
  @IsOptional() @IsNumber() @Min(1000) maxMarketExposure?: number;
  @IsOptional() @IsInt() @Min(0) defaultPartnershipBps?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsBoolean() maintenanceMode?: boolean;
  @IsOptional() @IsBoolean() registrationEnabled?: boolean;
  @IsOptional() @IsBoolean() depositEnabled?: boolean;
  @IsOptional() @IsBoolean() withdrawalEnabled?: boolean;
  // Banner / branding fields
  @IsOptional() @IsString() subBanner?: string;
  @IsOptional() @IsString() marqueeText?: string;
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsString() siteTagline?: string;
  // In-house games list (arbitrary JSON array)
  @IsOptional() inhouseGames?: any[];
  // Hero banner slides list
  @IsOptional() heroBanners?: any[];
  // Small promo banner strip
  @IsOptional() promoBanners?: any[];
  @IsOptional() @IsNumber() @Min(5) @Max(120) promoBannerSpeed?: number;
  // Deposit methods blob (arbitrary JSON)
  @IsOptional() depositMethods?: any;
  // Mines game config
  @IsOptional() @IsNumber() minesHouseEdge?: number;
  @IsOptional() @IsNumber() minesMinBet?: number;
  @IsOptional() @IsNumber() minesMaxBet?: number;
  @IsOptional() @IsBoolean() minesEnabled?: boolean;
  @IsOptional() @IsNumber() minesHardness?: number;
  // Top navigation bar items
  @IsOptional() navItems?: any[];
}

class DepositMethodsDto {
  @IsOptional() upi?: {
    enabled: boolean;
    upiId: string;
    qrCodeUrl?: string;
    displayName?: string;
  };
  @IsOptional() bank?: {
    enabled: boolean;
    accountName: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    branch?: string;
  };
  @IsOptional() crypto?: {
    enabled: boolean;
    address: string;
    network: string;
    coin: string;
    qrCodeUrl?: string;
  };
}

class AddProviderDto {
  @IsString() name!: string;
  @IsString() key!: string;
  @IsString() category!: string;
}

class AddGameDto {
  @IsString() name!: string;
  @IsString() providerId!: string;
  @IsString() category!: string;
  @IsOptional() @IsString() thumbnail?: string;
  @IsOptional() @IsBoolean() isLive?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly markets: MarketsService,
    private readonly wallet: WalletService,
    private readonly settlement: SettlementService,
    private readonly casino: CasinoService,
  ) {}

  @Get("dashboard")
  dashboard() { return this.admin.dashboard(); }

  @Get("risk")
  risk(@Query("limit") limit?: string) { return this.admin.liveRisk(limit ? Number(limit) : 25); }

  // -- Manual market controls --

  @Post("markets/:id/odds")
  async setOdds(
    @CurrentUser() actor: AuthUser, @Param("id") marketId: string,
    @Body() dto: SetOddsDto, @Req() req: Request,
  ) {
    const r = await this.markets.setRunnerOdds({
      runnerId: dto.runnerId, backPrices: dto.backPrices, layPrices: dto.layPrices,
    });
    await this.admin.writeAudit(actor.id, "market.odds.set", { type: "market", id: marketId }, dto, req.ip);
    return r;
  }

  @Post("markets/:id/status")
  async setStatus(
    @CurrentUser() actor: AuthUser, @Param("id") marketId: string,
    @Body() dto: MarketStatusDto, @Req() req: Request,
  ) {
    const m = await this.markets.setMarketStatus(marketId, dto.status);
    await this.admin.writeAudit(actor.id, "market.status.set", { type: "market", id: marketId }, dto, req.ip);
    return m;
  }

  @Post("markets/:id/settle")
  async settle(
    @CurrentUser() actor: AuthUser, @Param("id") marketId: string,
    @Body() dto: SettleMarketDto, @Req() req: Request,
  ) {
    await this.admin.writeAudit(actor.id, "market.settle", { type: "market", id: marketId }, dto, req.ip);
    return this.settlement.enqueue({ marketId, ...dto, actorId: actor.id });
  }

  // -- Manual wallet adjustment --

  @Post("wallet/adjust")
  async adjust(
    @CurrentUser() actor: AuthUser, @Body() dto: WalletAdjustDto, @Req() req: Request,
  ) {
    const out = await this.wallet.applyLedger({
      userId: dto.userId,
      kind: dto.amount >= 0 ? LedgerKind.ADMIN_CREDIT : LedgerKind.ADMIN_DEBIT,
      amount: dto.amount,
      refType: "admin",
      refId: actor.id,
      note: dto.note,
      allowNegative: dto.amount < 0,
    });
    await this.admin.writeAudit(actor.id, "wallet.adjust", { type: "user", id: dto.userId }, { amount: dto.amount, note: dto.note }, req.ip);
    return out;
  }

  // -- Audit log --

  @Get("logs")
  logs(@Query("actorId") actorId?: string, @Query("action") action?: string, @Query("limit") limit?: string) {
    return this.admin.listLogs({ actorId, action, limit: limit ? Number(limit) : undefined });
  }

  // -- All bets across users --

  @Get("bets")
  allBets(
    @Query("username") username?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("skip") skip?: string,
  ) {
    return this.admin.listAllBets({
      username,
      status,
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  // -- Platform reports --

  @Get("reports")
  reports(@Query("days") days?: string) {
    return this.admin.getReports({ days: days ? Number(days) : undefined });
  }

  // -- Bet void / cancel --

  @Patch("bets/:id")
  async betAction(
    @CurrentUser() actor: AuthUser, @Param("id") betId: string,
    @Body() dto: BetActionDto, @Req() req: Request,
  ) {
    const result = await this.admin.voidOrCancelBet(betId, dto.action);
    await this.admin.writeAudit(actor.id, `bet.${dto.action}`, { type: "bet", id: betId }, dto, req.ip);
    return result;
  }

  // -- User Profile --

  @Get("users/:id/profile")
  getUserProfile(@Param("id") id: string) {
    return this.admin.getUserProfile(id);
  }

  @Post("users/:id/notes")
  async addUserNote(
    @CurrentUser() actor: AuthUser, @Param("id") id: string,
    @Body() dto: { note: string }, @Req() req: Request,
  ) {
    return this.admin.addUserNote(actor.id, id, dto.note);
  }

  // -- Platform Settings --

  @Get("platform-settings")
  async getSettings() {
    const settings = await this.admin.getPlatformSettings() as any;
    const defaultInhouseGames = [
      { id: "roulette", name: "Roulette", description: "European Roulette",     href: "/roulette", thumbnail: "/game-thumbs/roulette.svg", emoji: "🎯", bg: "linear-gradient(135deg,#7f0000 0%,#b71c1c 50%,#4a0000 100%)", sortOrder: 0 },
      { id: "mines",    name: "Mines",    description: "Mines Game",             href: "/mines",    thumbnail: "/game-thumbs/mines.webp",    emoji: "💣", bg: "linear-gradient(135deg,#0a3d1a 0%,#1b5e20 50%,#062210 100%)", sortOrder: 1 },
      { id: "plinko",   name: "Plinko",   description: "Provably Fair Plinko",   href: "/plinko",   thumbnail: "/game-thumbs/plinko.svg",   emoji: "🎯", bg: "linear-gradient(135deg,#2d0b6b 0%,#7c3aed 50%,#1a0040 100%)", sortOrder: 2 },
      { id: "baloon",   name: "BALLOON",  description: "Balloon Crash Game",     href: "/balloon",  thumbnail: "/game-thumbs/balloon.svg",  emoji: "🎈", bg: "linear-gradient(135deg,#1a0000 0%,#7f1d1d 50%,#1a0000 100%)", sortOrder: 3 },
    ];
    const storedGames: any[] = settings.inhouseGames ?? [];
    if (!storedGames.length) return { ...settings, inhouseGames: defaultInhouseGames };
    const defaultMap = new Map(defaultInhouseGames.map(g => [g.id, g]));
    const merged = storedGames.map(g => (!g.thumbnail && defaultMap.has(g.id)) ? { ...g, thumbnail: defaultMap.get(g.id)!.thumbnail } : g);
    const storedIds = new Set(storedGames.map((g: any) => g.id));
    const missing = defaultInhouseGames.filter(g => !storedIds.has(g.id));
    return { ...settings, inhouseGames: [...merged, ...missing].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)) };
  }

  @Post("platform-settings")
  async saveSettings(@CurrentUser() actor: AuthUser, @Body() dto: PlatformSettingsDto, @Req() req: Request) {
    const result = await this.admin.savePlatformSettings(dto as any);
    await this.admin.writeAudit(actor.id, "platform.settings.update", undefined, dto, req.ip);
    return result;
  }

  // -- Deposit Payment Methods (admin sets, users read) --

  @Get("deposit-methods")
  async getDepositMethodsAdmin() {
    const settings = await this.admin.getPlatformSettings();
    return (settings as any).depositMethods ?? {};
  }

  @Post("deposit-methods")
  async saveDepositMethods(@CurrentUser() actor: AuthUser, @Body() dto: DepositMethodsDto, @Req() req: Request) {
    const result = await this.admin.savePlatformSettings({ depositMethods: dto } as any);
    await this.admin.writeAudit(actor.id, "platform.depositMethods.update", undefined, dto, req.ip);
    return result;
  }

  // -- File upload --

  @Post("upload")
  @UseInterceptors(FileInterceptor("file", {
    storage: multer.diskStorage({
      destination: (_req: any, _file: any, cb: (e: null | Error, d: string) => void) => {
        cb(null, process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads"));
      },
      filename: (_req: any, file: any, cb: (e: null, n: string) => void) => {
        const unique = randomBytes(10).toString("hex");
        cb(null, unique + extname(file.originalname));
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: (e: null, ok: boolean) => void) => {
      cb(null, /image\/(jpeg|png|webp|gif)/.test(file.mimetype));
    },
  }))
  async uploadFile(
    @UploadedFile() file: { filename: string; path: string; mimetype: string },
    @Query("type") uploadType: string,
    @Req() _req: Request,
  ) {
    const uploadsDir = process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");
    const outName = randomBytes(10).toString("hex") + ".webp";
    const outPath = join(uploadsDir, outName);
    // hero: 1920×480; promo: 600×200; thumbnail (game tile 3:4): 300×400; default: 1920×480
    const dims = uploadType === "promo"
      ? { width: 600,  height: 200 }
      : uploadType === "thumbnail"
      ? { width: 300,  height: 400 }
      : { width: 1920, height: 480 };
    try {
      await sharp(file.path)
        .resize({ ...dims, fit: "cover", withoutEnlargement: false })
        .webp({ quality: 88 })
        .toFile(outPath);
      await unlink(file.path);
    } catch {
      await rename(file.path, join(uploadsDir, outName.replace(".webp", extname(file.path))));
      return { url: `/api/uploads/${outName.replace(".webp", extname(file.path))}` };
    }
    return { url: `/api/uploads/${outName}` };
  }

  // -- Casino CRUD (admin only) --

  @Post("casino/providers")
  async addProvider(@CurrentUser() actor: AuthUser, @Body() dto: AddProviderDto, @Req() req: Request) {
    const r = await this.casino.createProvider(dto);
    await this.admin.writeAudit(actor.id, "casino.provider.create", { type: "provider", id: r.id }, dto, req.ip);
    return r;
  }

  @Delete("casino/providers/:id")
  async deleteProvider(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    const r = await this.casino.deleteProvider(id);
    await this.admin.writeAudit(actor.id, "casino.provider.delete", { type: "provider", id }, {}, req.ip);
    return r;
  }

  @Post("casino/games")
  async addGame(@CurrentUser() actor: AuthUser, @Body() dto: AddGameDto, @Req() req: Request) {
    const r = await this.casino.createGame(dto);
    await this.admin.writeAudit(actor.id, "casino.game.create", { type: "game", id: r.id }, dto, req.ip);
    return r;
  }

  @Patch("casino/games/:id")
  async updateGame(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: any, @Req() req: Request) {
    const r = await this.casino.updateGame(id, dto);
    await this.admin.writeAudit(actor.id, "casino.game.update", { type: "game", id }, dto, req.ip);
    return r;
  }

  @Delete("casino/games/:id")
  async deleteGame(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    const r = await this.casino.deleteGame(id);
    await this.admin.writeAudit(actor.id, "casino.game.delete", { type: "game", id }, {}, req.ip);
    return r;
  }
}

@Controller("platform")
export class PublicPlatformController {
  constructor(private readonly admin: AdminService) {}

  @Get("deposit-methods")
  async getDepositMethods() {
    const settings = await this.admin.getPlatformSettings();
    return (settings as any).depositMethods ?? {};
  }

  @Get("settings")
  async getPublicSettings() {
    const settings = await this.admin.getPlatformSettings();
    const defaultInhouseGames = [
      { id: "roulette", name: "Roulette", description: "European Roulette",   href: "/roulette", thumbnail: "/game-thumbs/roulette.svg", emoji: "🎯", bg: "linear-gradient(135deg,#7f0000 0%,#b71c1c 50%,#4a0000 100%)", sortOrder: 0 },
      { id: "mines",    name: "Mines",    description: "Mines Game",           href: "/mines",    thumbnail: "/game-thumbs/mines.webp",    emoji: "💣", bg: "linear-gradient(135deg,#0a3d1a 0%,#1b5e20 50%,#062210 100%)", sortOrder: 1 },
      { id: "plinko",   name: "Plinko",   description: "Provably Fair Plinko", href: "/plinko",   thumbnail: "/game-thumbs/plinko.svg",   emoji: "🎯", bg: "linear-gradient(135deg,#2d0b6b 0%,#7c3aed 50%,#1a0040 100%)", sortOrder: 2 },
      { id: "baloon",   name: "BALLOON",  description: "Balloon Crash Game",   href: "/balloon",  thumbnail: "/game-thumbs/balloon.svg",  emoji: "🎈", bg: "linear-gradient(135deg,#1a0000 0%,#7f1d1d 50%,#1a0000 100%)", sortOrder: 3 },
    ];
    const defaultNavItems = [
      { href: "/exchange",   label: "EXCHANGE",    emoji: "🎰", enabled: true },
      { href: "/casino",     label: "LIVE CASINO", emoji: "🎲", enabled: true },
      { href: "/crash",      label: "CRASH GAMES", emoji: "🚀", enabled: true },
      { href: "/virtual",    label: "VIRTUAL GAME",emoji: "🎮", enabled: true },
      { href: "/vr-games",   label: "VR GAMES",    emoji: "🥽", enabled: true },
      { href: "/slots",      label: "SLOT GAMES",  emoji: "✨", enabled: true },
      { href: "/lottery",    label: "LOTTERY",     emoji: "🎟️", enabled: true },
      { href: "/sportsbook", label: "SPORTS BOOK", emoji: "🎯", enabled: true },
    ];
    // Merge: always include all default built-in games; admin-added extras are appended.
    // If a stored game has no thumbnail, fall back to the built-in SVG default.
    const storedGames: any[] = (settings as any).inhouseGames ?? [];
    const defaultMap = new Map(defaultInhouseGames.map(g => [g.id, g]));
    const storedIds = new Set(storedGames.map((g: any) => g.id));
    const missingDefaults = defaultInhouseGames.filter(g => !storedIds.has(g.id));
    const mergedGames = [
      ...storedGames.map(g => (!g.thumbnail && defaultMap.has(g.id)) ? { ...g, thumbnail: defaultMap.get(g.id)!.thumbnail } : g),
      ...missingDefaults,
    ].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

    return {
      subBanner:     (settings as any).subBanner     ?? "Bet Now in Line Market and Get Commission Upto 2%",
      siteName:      (settings as any).siteName      ?? "Future9",
      siteTagline:   (settings as any).siteTagline   ?? "Sports & Casino",
      marqueeText:   (settings as any).marqueeText   ?? "📢 Live Markets Now Available — Play Smart, Win Big! • Bet Now in Line Markets and Get Commission Upto 2%",
      inhouseGames:  mergedGames,
      heroBanners:   (settings as any).heroBanners   ?? [],
      promoBanners:  (settings as any).promoBanners  ?? [],
      promoBannerSpeed: Number((settings as any).promoBannerSpeed ?? 45),
      minesMinBet:   Number((settings as any).minesMinBet  ?? 10),
      minesMaxBet:   Number((settings as any).minesMaxBet  ?? 100000),
      minesEnabled:  (settings as any).minesEnabled !== false,
      navItems:      (settings as any).navItems      ?? defaultNavItems,
    };
  }
}
