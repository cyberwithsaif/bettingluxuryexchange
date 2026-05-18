import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
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
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

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
  @IsOptional() @IsBoolean() maintenanceMode?: boolean;
  @IsOptional() @IsBoolean() registrationEnabled?: boolean;
  @IsOptional() @IsBoolean() depositEnabled?: boolean;
  @IsOptional() @IsBoolean() withdrawalEnabled?: boolean;
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

  // -- Platform Settings --

  @Get("platform-settings")
  getSettings() { return this.admin.getPlatformSettings(); }

  @Post("platform-settings")
  async saveSettings(@CurrentUser() actor: AuthUser, @Body() dto: PlatformSettingsDto, @Req() req: Request) {
    const result = await this.admin.savePlatformSettings(dto as any);
    await this.admin.writeAudit(actor.id, "platform.settings.update", undefined, dto, req.ip);
    return result;
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

  @Delete("casino/games/:id")
  async deleteGame(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    const r = await this.casino.deleteGame(id);
    await this.admin.writeAudit(actor.id, "casino.game.delete", { type: "game", id }, {}, req.ip);
    return r;
  }
}
