import {
  Body, Controller, Get, Post, Param, Query,
  UseGuards, ParseIntPipe,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PumpService } from "./pump.service";
import { UserRole } from "@prisma/client";

class PlaceBetDto {
  betAmount!: number;
  autoCashAt?: number | null;
}

class CashOutDto {
  roundId!: string;
}

class SaveConfigDto {
  enabled?: boolean;
  minBet?: number;
  maxBet?: number;
  maxPayout?: number;
  rtpPercent?: number;
  autoCashLimit?: number;
  forceNextCrash?: number | null;
}

@SkipThrottle()
@Controller("casino/pump")
export class PumpController {
  constructor(private readonly service: PumpService) {}

  @Get("config")
  async publicConfig() {
    const c = await this.service.getConfig();
    return {
      enabled:       c.enabled,
      minBet:        c.minBet,
      maxBet:        c.maxBet,
      maxPayout:     c.maxPayout,
      rtpPercent:    c.rtpPercent,
      autoCashLimit: c.autoCashLimit,
    };
  }

  @Get("current")
  async current() {
    return this.service.getCurrentRound();
  }

  @Get("history")
  async history(@Query("limit") limit?: string) {
    const n = limit ? Math.min(50, Math.max(1, Number(limit))) : 20;
    return this.service.getRecentRounds(n);
  }

  @Get("live-bets")
  async liveBets(@Query("limit") limit?: string) {
    const n = limit ? Math.min(50, Math.max(1, Number(limit))) : 30;
    return this.service.getLiveBets(n);
  }

  @UseGuards(JwtAuthGuard)
  @Post("bet")
  async placeBet(@CurrentUser() user: any, @Body() dto: PlaceBetDto) {
    return this.service.placeBet(user.id, {
      betAmount: Number(dto.betAmount),
      autoCashAt: dto.autoCashAt ? Number(dto.autoCashAt) : null,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("cashout")
  async cashOut(@CurrentUser() user: any, @Body() dto: CashOutDto) {
    return this.service.cashOut(user.id, dto.roundId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-bets")
  async myBets(@CurrentUser() user: any, @Query("limit") limit?: string) {
    const n = limit ? Math.min(200, Math.max(1, Number(limit))) : 50;
    return this.service.getUserBets(user.id, n);
  }

  @Get("verify/:roundId")
  async verify(@Param("roundId") roundId: string) {
    return this.service.verifyRound(roundId);
  }

  // ── Admin ────────────────────────────────────────────────────

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
    return this.service.saveConfig({
      ...(dto.enabled       != null ? { enabled: Boolean(dto.enabled) } : {}),
      ...(dto.minBet        != null ? { minBet: Number(dto.minBet) } : {}),
      ...(dto.maxBet        != null ? { maxBet: Number(dto.maxBet) } : {}),
      ...(dto.maxPayout     != null ? { maxPayout: Number(dto.maxPayout) } : {}),
      ...(dto.rtpPercent    != null ? { rtpPercent: Number(dto.rtpPercent) } : {}),
      ...(dto.autoCashLimit != null ? { autoCashLimit: Number(dto.autoCashLimit) } : {}),
      ...(dto.forceNextCrash !== undefined
        ? { forceNextCrash: dto.forceNextCrash != null ? Number(dto.forceNextCrash) : null }
        : {}),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/stats")
  adminStats() {
    return this.service.getAdminStats();
  }
}
