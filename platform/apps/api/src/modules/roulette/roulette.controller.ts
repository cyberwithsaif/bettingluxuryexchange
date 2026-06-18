import { Body, Controller, Get, Post, UseGuards, Query } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { RouletteService, BetType } from "./roulette.service";

class RouletteConfigDto {
  @IsOptional() @IsNumber() @Min(0) @Max(200) rtpPercent?: number;
  @IsOptional() @IsNumber() @Min(1) minBet?: number;
  @IsOptional() @IsNumber() @Min(1) maxBet?: number;
  @IsOptional() @IsNumber() @Min(0) maxPayout?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  // 0-9 for Mini Roulette, null to clear
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(9) forceNumber?: number | null;
}

class PlaceBetDto {
  @IsString()
  @IsIn(["number", "red", "black", "green", "odd", "even", "high", "low"])
  betType!: BetType;

  @IsOptional() @IsString()
  betValue?: string;

  @IsNumber() @Min(10) @Max(100_000)
  amount!: number;
}

@SkipThrottle()
@Controller("roulette")
export class RouletteController {
  constructor(private readonly service: RouletteService) {}

  @Get("current")
  current() { return this.service.getCurrentRound(); }

  @Get("history")
  history(@Query("limit") limit?: string) {
    return this.service.getRecentResults(limit ? Math.min(50, Math.max(1, Number(limit))) : 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post("bet")
  async placeBet(@CurrentUser() user: AuthUser, @Body() dto: PlaceBetDto) {
    return this.service.placeBet(user.id, { betType: dto.betType, betValue: dto.betValue ?? null, amount: dto.amount });
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-bets")
  async myBets(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.service.getUserBets(user.id, limit ? Math.min(100, Math.max(1, Number(limit))) : 50);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get("admin/config")
  adminConfig() { return this.service.getAdminConfig(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post("admin/config")
  saveAdminConfig(@Body() dto: RouletteConfigDto) {
    return this.service.saveAdminConfig(dto as Record<string, unknown>);
  }
}
