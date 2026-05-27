import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { extname, join } from "path";
import { randomBytes } from "crypto";
import { rename, unlink, writeFile } from "fs/promises";
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

class SetRoleDto {
  @IsEnum(UserRole) role!: UserRole;
}

class VipLevelDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() tier?: number;
  @IsOptional() @IsNumber() @Min(0) minWagered?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) cashbackBps?: number;
  @IsOptional() @IsNumber() @Min(0) bonusAmount?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString({ each: true }) perks?: string[];
}

class AssignVipDto {
  @IsString() username!: string;
  @IsOptional() @IsString() vipLevelId?: string | null;
}

class UserFlagsDto {
  @IsOptional() @IsBoolean() withdrawalsFrozen?: boolean;
  @IsOptional() @IsBoolean() flaggedSuspicious?: boolean;
}

class PromoDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsIn(["DEPOSIT_BONUS", "FREE_CREDIT", "CASHBACK"]) type?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) percentage?: number;
  @IsOptional() @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @IsNumber() @Min(0) minDeposit?: number;
  @IsOptional() @IsInt() @Min(1) wagerMultiplier?: number;
  @IsOptional() @IsString() expiresAt?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

class ReplyTicketDto {
  @IsString() body!: string;
}

class TicketStatusDto {
  @IsIn(["OPEN", "PENDING", "RESOLVED", "CLOSED"]) status!: string;
}

class RevokeUserDto {
  @IsString() userId!: string;
}

class SecurityConfigDto {
  @IsOptional() @IsString({ each: true }) ipAllowlist?: string[];
  @IsOptional() @IsBoolean() antiDdosEnabled?: boolean;
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
  @IsOptional() @IsNumber() @Min(0) minWithdrawal?: number;
  @IsOptional() @IsNumber() @Min(0) maxWithdrawal?: number;
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

  @Get("pl-control")
  plControl() { return this.admin.getPlControl(); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Post("pl-control")
  savePlControl(@CurrentUser() actor: AuthUser, @Body() dto: any, @Req() req: Request) {
    void this.admin.writeAudit(actor.id, "pl.control.update", undefined, dto, req.ip);
    return this.admin.savePlatformSettings(dto);
  }

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

  @Delete("markets/:id")
  async deleteMarket(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    const r = await this.admin.deleteMarket(id);
    await this.admin.writeAudit(actor.id, "market.delete", { type: "market", id }, {}, req.ip);
    return r;
  }

  @Delete("matches/:id")
  async deleteMatch(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    const r = await this.admin.deleteMatch(id);
    await this.admin.writeAudit(actor.id, "match.delete", { type: "match", id }, {}, req.ip);
    return r;
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

  @Get("casino-bets")
  allCasinoBets(
    @Query("username") username?: string,
    @Query("game") game?: string,
    @Query("limit") limit?: string,
    @Query("skip") skip?: string,
  ) {
    return this.admin.listAllCasinoBets({
      username,
      game,
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  // -- Platform reports --

  @Get("reports")
  reports(@Query("days") days?: string) {
    return this.admin.getReports({ days: days ? Number(days) : undefined });
  }

  // -- Provably fair seed viewer --

  @Get("provably-fair")
  provablyFair(
    @Query("game") game?: string,
    @Query("username") username?: string,
    @Query("limit") limit?: string,
  ) {
    return this.admin.listProvablyFair({ game, username, limit: limit ? Number(limit) : undefined });
  }

  // -- Real-time monitoring --

  @Get("monitoring")
  monitoring() { return this.admin.getMonitoring(); }

  // -- Affiliates / referrals --

  @Get("affiliates")
  affiliates(@Query("limit") limit?: string) {
    return this.admin.listAffiliates({ limit: limit ? Number(limit) : undefined });
  }

  // -- Admin / staff role management --

  @Get("staff")
  staff() { return this.admin.listStaff(); }

  @Patch("users/:id/role")
  async setRole(
    @CurrentUser() actor: AuthUser, @Param("id") id: string,
    @Body() dto: SetRoleDto, @Req() req: Request,
  ) {
    const result = await this.admin.setUserRole(id, dto.role, actor.role as UserRole);
    await this.admin.writeAudit(actor.id, "user.role.set", { type: "user", id }, dto, req.ip);
    return result;
  }

  // -- VIP levels --

  @Get("vip/levels")
  vipLevels() { return this.admin.listVipLevels(); }

  @Get("vip/overview")
  vipOverview() { return this.admin.getVipOverview(); }

  @Post("vip/levels")
  async createVip(@CurrentUser() actor: AuthUser, @Body() dto: VipLevelDto, @Req() req: Request) {
    if (!dto.name || dto.tier === undefined) throw new Error("name and tier are required");
    const r = await this.admin.createVipLevel({ name: dto.name, tier: dto.tier, ...dto });
    await this.admin.writeAudit(actor.id, "vip.level.create", { type: "vipLevel", id: r.id }, dto, req.ip);
    return r;
  }

  @Patch("vip/levels/:id")
  async updateVip(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: VipLevelDto, @Req() req: Request) {
    const r = await this.admin.updateVipLevel(id, dto);
    await this.admin.writeAudit(actor.id, "vip.level.update", { type: "vipLevel", id }, dto, req.ip);
    return r;
  }

  @Delete("vip/levels/:id")
  async deleteVip(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    const r = await this.admin.deleteVipLevel(id);
    await this.admin.writeAudit(actor.id, "vip.level.delete", { type: "vipLevel", id }, {}, req.ip);
    return r;
  }

  @Post("vip/assign")
  async assignVip(@CurrentUser() actor: AuthUser, @Body() dto: AssignVipDto, @Req() req: Request) {
    const r = await this.admin.assignVip(dto.username, dto.vipLevelId ?? null);
    await this.admin.writeAudit(actor.id, "vip.assign", { type: "user", id: r.id }, dto, req.ip);
    return r;
  }

  // -- Promo codes --

  @Get("promos")
  promos() { return this.admin.listPromos(); }

  @Post("promos")
  async createPromo(@CurrentUser() actor: AuthUser, @Body() dto: PromoDto, @Req() req: Request) {
    if (!dto.code) throw new Error("code is required");
    const r = await this.admin.createPromo({ code: dto.code, ...dto });
    await this.admin.writeAudit(actor.id, "promo.create", { type: "promo", id: r.id }, dto, req.ip);
    return r;
  }

  @Patch("promos/:id")
  async updatePromo(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: PromoDto, @Req() req: Request) {
    const r = await this.admin.updatePromo(id, dto);
    await this.admin.writeAudit(actor.id, "promo.update", { type: "promo", id }, dto, req.ip);
    return r;
  }

  @Delete("promos/:id")
  async deletePromo(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    const r = await this.admin.deletePromo(id);
    await this.admin.writeAudit(actor.id, "promo.delete", { type: "promo", id }, {}, req.ip);
    return r;
  }

  // -- Support tickets --

  @Get("support/tickets")
  supportTickets(@Query("status") status?: string) { return this.admin.listSupportTickets(status); }

  @Get("support/tickets/:id")
  supportTicket(@Param("id") id: string) { return this.admin.getSupportTicket(id); }

  @Post("support/tickets/:id/messages")
  async replyTicket(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: ReplyTicketDto, @Req() req: Request) {
    const r = await this.admin.replySupportTicket(actor.id, id, dto.body);
    await this.admin.writeAudit(actor.id, "support.reply", { type: "ticket", id }, {}, req.ip);
    return r;
  }

  @Patch("support/tickets/:id/status")
  async ticketStatus(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: TicketStatusDto, @Req() req: Request) {
    const r = await this.admin.setSupportStatus(id, dto.status);
    await this.admin.writeAudit(actor.id, "support.status", { type: "ticket", id }, dto, req.ip);
    return r;
  }

  // -- Security center --

  @Get("security/overview")
  securityOverview() { return this.admin.getSecurityOverview(); }

  @Get("security/sessions")
  securitySessions(@Query("limit") limit?: string) { return this.admin.listActiveSessions(limit ? Number(limit) : undefined); }

  @Get("security/2fa")
  security2fa() { return this.admin.list2faStatus(); }

  @Delete("security/sessions/:id")
  async revokeSession(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    const r = await this.admin.revokeSession(id);
    await this.admin.writeAudit(actor.id, "security.session.revoke", { type: "session", id }, {}, req.ip);
    return r;
  }

  @Post("security/sessions/revoke-user")
  async forceLogout(@CurrentUser() actor: AuthUser, @Body() dto: RevokeUserDto, @Req() req: Request) {
    const r = await this.admin.revokeUserSessions(dto.userId);
    await this.admin.writeAudit(actor.id, "security.force_logout", { type: "user", id: dto.userId }, r, req.ip);
    return r;
  }

  @Post("security/config")
  async saveSecurityConfig(@CurrentUser() actor: AuthUser, @Body() dto: SecurityConfigDto, @Req() req: Request) {
    const r = await this.admin.saveSecurityConfig(dto);
    await this.admin.writeAudit(actor.id, "security.config.update", undefined, dto, req.ip);
    return r;
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

  @Patch("users/:id/flags")
  setUserFlags(
    @CurrentUser() actor: AuthUser, @Param("id") id: string,
    @Body() dto: UserFlagsDto, @Req() req: Request,
  ) {
    return this.admin.setUserFlags(actor.id, id, dto, req.ip);
  }

  // -- Platform Settings --

  @Get("platform-settings")
  async getSettings() {
    const settings = await this.admin.getPlatformSettings() as any;
    const defaultInhouseGames = [
      { id: "roulette", name: "Roulette", description: "European Roulette",     href: "/roulette", thumbnail: "/game-thumbs/roulette.webp", emoji: "🎯", bg: "linear-gradient(135deg,#7f0000 0%,#b71c1c 50%,#4a0000 100%)", sortOrder: 0 },
      { id: "mines",    name: "Mines",    description: "Mines Game",             href: "/mines",    thumbnail: "/game-thumbs/mines.webp",    emoji: "💣", bg: "linear-gradient(135deg,#0a3d1a 0%,#1b5e20 50%,#062210 100%)", sortOrder: 1 },
      { id: "plinko",   name: "Plinko",   description: "Provably Fair Plinko",   href: "/plinko",   thumbnail: "/game-thumbs/plinko.webp",   emoji: "🎯", bg: "linear-gradient(135deg,#2d0b6b 0%,#7c3aed 50%,#1a0040 100%)", sortOrder: 2 },
      { id: "baloon",   name: "BALLOON",  description: "Balloon Crash Game",     href: "/pump",     thumbnail: "/game-thumbs/balloon.webp",  emoji: "🎈", bg: "linear-gradient(135deg,#1a0000 0%,#7f1d1d 50%,#1a0000 100%)", sortOrder: 3 },
      { id: "chicken-road", name: "Chicken Road", description: "Cross & Cash Out", href: "/chicken-road", thumbnail: "/game-thumbs/chicken.png", emoji: "🐔", bg: "linear-gradient(135deg,#3a1c00 0%,#d97706 50%,#1a0e00 100%)", sortOrder: 7 },
      { id: "crash",    name: "Crash",    description: "Crash Games",            href: "/crash",    thumbnail: null, emoji: "🚀", bg: "linear-gradient(135deg,#0a0a2e 0%,#3b0a6e 50%,#08081a 100%)", sortOrder: 8 },
      { id: "slots",    name: "Slots",    description: "Slot Games",             href: "/slots",    thumbnail: null, emoji: "🎰", bg: "linear-gradient(135deg,#2a0040 0%,#9333ea 50%,#15001f 100%)", sortOrder: 9 },
      { id: "lottery",  name: "Lottery",  description: "Lottery Games",          href: "/lottery",  thumbnail: null, emoji: "🎟️", bg: "linear-gradient(135deg,#003322 0%,#059669 50%,#001a11 100%)", sortOrder: 10 },
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
    // Detect input format and keep the original extension (.png/.jpg/.jpeg/.webp/.gif)
    const srcExt = (extname(file.path) || ".png").toLowerCase();
    const ext = srcExt === ".jpeg" ? ".jpg" : srcExt;
    const outName = randomBytes(10).toString("hex") + ext;
    const outPath = join(uploadsDir, outName);
    // Sizing rules per type:
    //   thumbnail → HD 600×800 max, preserve full image (fit: inside, no crop, no padding)
    //   hero      → 1920×480 cover
    //   promo     → 600×200 cover
    //   default (missing/unknown type) → safer thumbnail fallback instead of hero crop
    const isThumbnail = uploadType === "thumbnail" || !uploadType;   // safe fallback
    const dims = uploadType === "promo"
      ? { width: 600,  height: 200, fit: "cover" as const }
      : uploadType === "hero"
      ? { width: 1920, height: 480, fit: "cover" as const }
      : { width: 600,  height: 800, fit: "inside" as const };        // HD, full image, no crop
    try {
      const MAX_BYTES = 900 * 1024; // 900 KB hard cap
      // Choose output encoder matching the original format — NO format conversion
      const pipeline = sharp(file.path).resize({ ...dims, withoutEnlargement: false });
      let quality = isThumbnail ? 92 : 88;
      const encode = (q: number) => {
        // Aggressively fast encoder settings — thumbnail output at 600×800 is small enough
        if (ext === ".png")  return pipeline.clone().png({ quality: q, compressionLevel: 3, effort: 1, palette: true }).toBuffer();
        if (ext === ".webp") return pipeline.clone().webp({ quality: q, effort: 1 }).toBuffer();
        if (ext === ".gif")  return pipeline.clone().gif().toBuffer();
        return pipeline.clone().jpeg({ quality: q }).toBuffer();   // .jpg fallback (libjpeg, fast)
      };
      let buf = await encode(quality);
      while (buf.length > MAX_BYTES && quality > 60) {
        quality -= 4;
        buf = await encode(quality);
      }
      await writeFile(outPath, buf);
      await unlink(file.path);
    } catch {
      await rename(file.path, outPath);
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

  @Get("promos")
  activePromos() {
    return this.admin.listActivePromos();
  }

  @Get("deposit-methods")
  async getDepositMethods() {
    const settings = await this.admin.getPlatformSettings();
    return (settings as any).depositMethods ?? {};
  }

  @Get("settings")
  async getPublicSettings() {
    const settings = await this.admin.getPlatformSettings();
    const defaultInhouseGames = [
      { id: "roulette", name: "Roulette", description: "European Roulette",   href: "/roulette", thumbnail: "/game-thumbs/roulette.webp", emoji: "🎯", bg: "linear-gradient(135deg,#7f0000 0%,#b71c1c 50%,#4a0000 100%)", sortOrder: 0 },
      { id: "mines",    name: "Mines",    description: "Mines Game",           href: "/mines",    thumbnail: "/game-thumbs/mines.webp",    emoji: "💣", bg: "linear-gradient(135deg,#0a3d1a 0%,#1b5e20 50%,#062210 100%)", sortOrder: 1 },
      { id: "plinko",   name: "Plinko",   description: "Provably Fair Plinko", href: "/plinko",   thumbnail: "/game-thumbs/plinko.webp",   emoji: "🎯", bg: "linear-gradient(135deg,#2d0b6b 0%,#7c3aed 50%,#1a0040 100%)", sortOrder: 2 },
      { id: "baloon",   name: "BALLOON",  description: "Balloon Crash Game",   href: "/pump",     thumbnail: "/game-thumbs/balloon.webp",  emoji: "🎈", bg: "linear-gradient(135deg,#1a0000 0%,#7f1d1d 50%,#1a0000 100%)", sortOrder: 3 },
      { id: "chicken-road", name: "Chicken Road", description: "Cross & Cash Out", href: "/chicken-road", thumbnail: "/game-thumbs/chicken.png", emoji: "🐔", bg: "linear-gradient(135deg,#3a1c00 0%,#d97706 50%,#1a0e00 100%)", sortOrder: 7 },
      { id: "crash",    name: "Crash",    description: "Crash Games",          href: "/crash",    thumbnail: null, emoji: "🚀", bg: "linear-gradient(135deg,#0a0a2e 0%,#3b0a6e 50%,#08081a 100%)", sortOrder: 8 },
      { id: "slots",    name: "Slots",    description: "Slot Games",           href: "/slots",    thumbnail: null, emoji: "🎰", bg: "linear-gradient(135deg,#2a0040 0%,#9333ea 50%,#15001f 100%)", sortOrder: 9 },
      { id: "lottery",  name: "Lottery",  description: "Lottery Games",        href: "/lottery",  thumbnail: null, emoji: "🎟️", bg: "linear-gradient(135deg,#003322 0%,#059669 50%,#001a11 100%)", sortOrder: 10 },
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
