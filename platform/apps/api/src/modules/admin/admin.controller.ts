import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
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
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

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
  @IsNumber() amount!: number;       // signed: +credit, -debit
  @IsOptional() @IsString() note?: string;
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
}
