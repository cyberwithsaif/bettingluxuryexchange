import { Body, Controller, Get, Post, UseGuards, Query, Req } from "@nestjs/common";
import { ChickenRoadService } from "./chicken-road.service";
import { AdminService } from "../admin/admin.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";

@Controller("casino/chicken-road")
export class ChickenRoadController {
  constructor(
    private readonly chickenRoadService: ChickenRoadService,
    private readonly adminService: AdminService,
  ) {}

  @Get("history")
  getRecentResults() {
    return this.chickenRoadService.getRecentResults(20);
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-bets")
  getUserBets(@Req() req: any, @Query("limit") limit?: string) {
    return this.chickenRoadService.getUserBets(req.user.userId, limit ? parseInt(limit, 10) : 50);
  }

  @UseGuards(JwtAuthGuard)
  @Get("active")
  getActiveSession(@Req() req: any) {
    return this.chickenRoadService.getActiveSession(req.user.userId);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/stats")
  getAdminStats() {
    return this.chickenRoadService.getAdminStats();
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
    return this.chickenRoadService.getAdminHistory({
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
    return this.chickenRoadService.expireStale(minutes ? parseInt(minutes, 10) : 120);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/config")
  async getConfig() {
    const s = (await this.adminService.getPlatformSettings()) as any;
    return {
      chickenRoadHouseEdge: Number(s.chickenRoadHouseEdge ?? 0.03),
      chickenRoadMinBet:    Number(s.chickenRoadMinBet    ?? 10),
      chickenRoadMaxBet:    Number(s.chickenRoadMaxBet    ?? 100_000),
      chickenRoadEnabled:   s.chickenRoadEnabled !== false,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("admin/config")
  saveConfig(@Body() dto: any) {
    return this.adminService.savePlatformSettings(dto);
  }
}
