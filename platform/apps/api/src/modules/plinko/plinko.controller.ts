import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { IsIn, IsNumber, IsString, Max, Min, IsOptional } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { PlinkoService } from "./plinko.service";
import { UserRole } from "@prisma/client";

class PlaceBetDto {
  @IsNumber() @Min(1) @Max(100000)
  betAmount!: number;

  @IsNumber() @IsIn([8, 12, 16, 24])
  rows!: number;

  @IsString() @IsIn(["low", "medium", "high"])
  riskLevel!: string;

  @IsString()
  clientSeed!: string;
}

class SaveConfigDto {
  @IsOptional() enabled?: boolean;
  @IsOptional() @IsNumber() @Min(1)   minBet?: number;
  @IsOptional() @IsNumber() @Min(100) maxBet?: number;
  @IsOptional() @IsNumber() @Min(1000) maxPayout?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(200) rtpPercent?: number;
}

@SkipThrottle()
@Controller("plinko")
export class PlinkoController {
  constructor(private readonly service: PlinkoService) {}

  /** Public — current game config (enabled, min/max bet, multiplier tables) */
  @Get("config")
  async publicConfig(@Query("rows") rows?: string, @Query("risk") risk?: string) {
    const config = await this.service.getConfig();
    const r = rows ? Number(rows) : 16;
    const ri = risk ?? "medium";
    return {
      enabled:    config.enabled,
      minBet:     config.minBet,
      maxBet:     config.maxBet,
      maxPayout:  config.maxPayout,
      multipliers: this.service.getMultiplierTable(r, ri),
    };
  }

  /** Place a bet — authenticated */
  @UseGuards(JwtAuthGuard)
  @Post("bet")
  async placeBet(@CurrentUser() user: AuthUser, @Body() dto: PlaceBetDto) {
    return this.service.placeBet(user.id, {
      betAmount:  dto.betAmount,
      rows:       dto.rows,
      riskLevel:  dto.riskLevel,
      clientSeed: dto.clientSeed,
    });
  }

  /** Provably fair verification — public, by bet ID */
  @Get("verify/:betId")
  verify(@Param("betId") betId: string) {
    return this.service.verifyBet(betId);
  }

  /** Live feed — recent bets, public */
  @Get("live")
  live(@Query("limit") limit?: string) {
    return this.service.getLiveBets(limit ? Number(limit) : 20);
  }

  /** User's own bet history */
  @UseGuards(JwtAuthGuard)
  @Get("my-bets")
  myBets(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.service.getUserBets(user.id, limit ? Number(limit) : 50);
  }

  // ── Admin routes ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/stats")
  adminStats() {
    return this.service.getAdminStats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/config")
  adminConfig() {
    return this.service.getConfig();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("admin/config")
  saveConfig(@Body() dto: SaveConfigDto) {
    return this.service.saveConfig(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/bets")
  adminBets(@Query("limit") limit?: string, @Query("userId") userId?: string) {
    return this.service.getAdminBets({ limit: limit ? Number(limit) : 50, userId });
  }
}
