import { Body, Controller, Get, Post, UseGuards, Query, Req } from "@nestjs/common";
import { CoinflipService } from "./coinflip.service";
import { AdminService } from "../admin/admin.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";

@Controller("casino/coinflip")
export class CoinflipController {
  constructor(
    private readonly coinflipService: CoinflipService,
    private readonly adminService: AdminService,
  ) {}

  /** Public: game config (bet limits, multiplier ladder) */
  @Get("config")
  getPublicConfig() {
    return this.coinflipService.getPublicConfig();
  }

  /** Public: recent settled games (live feed) */
  @Get("history")
  getRecentResults() {
    return this.coinflipService.getRecentResults(20);
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-bets")
  getUserBets(@Req() req: any, @Query("limit") limit?: string) {
    return this.coinflipService.getUserBets(req.user.userId, limit ? parseInt(limit, 10) : 50);
  }

  @UseGuards(JwtAuthGuard)
  @Get("active")
  getActiveSession(@Req() req: any) {
    return this.coinflipService.getActiveSession(req.user.userId);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/stats")
  getAdminStats() {
    return this.coinflipService.getAdminStats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/history")
  getAdminHistory(
    @Query("limit") limit?: string,
    @Query("skip") skip?: string,
    @Query("status") status?: string,
    @Query("username") username?: string,
  ) {
    return this.coinflipService.getAdminHistory({
      limit: limit ? parseInt(limit, 10) : 50,
      skip:  skip  ? parseInt(skip,  10) : 0,
      status,
      username,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("admin/expire-stale")
  expireStale(@Query("minutes") minutes?: string) {
    return this.coinflipService.expireStale(minutes ? parseInt(minutes, 10) : 120);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/config")
  async getConfig() {
    const s = await this.adminService.getPlatformSettings() as any;
    return {
      coinflipHouseEdge: Number(s.coinflipHouseEdge ?? 0.01),
      coinflipMinBet:    Number(s.coinflipMinBet    ?? 10),
      coinflipMaxBet:    Number(s.coinflipMaxBet    ?? 100_000),
      coinflipEnabled:   s.coinflipEnabled !== false,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("admin/config")
  saveConfig(@Body() dto: any) {
    return this.adminService.savePlatformSettings(dto);
  }
}
