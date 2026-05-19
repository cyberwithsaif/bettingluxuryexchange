import { Body, Controller, Get, Post, UseGuards, Query, Req } from "@nestjs/common";
import { MinesService } from "./mines.service";
import { AdminService } from "../admin/admin.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { IsBoolean, IsNumber, IsOptional, Min, Max } from "class-validator";

class MinesConfigDto {
  @IsOptional() @IsNumber() @Min(0) @Max(0.5) minesHouseEdge?: number;
  @IsOptional() @IsNumber() @Min(1) minesMinBet?: number;
  @IsOptional() @IsNumber() @Min(100) minesMaxBet?: number;
  @IsOptional() @IsBoolean() minesEnabled?: boolean;
}

@Controller("mines")
export class MinesController {
  constructor(
    private readonly minesService: MinesService,
    private readonly adminService: AdminService,
  ) {}

  // ── Public / player endpoints ────────────────────────────────────────────

  @Get("history")
  getRecentResults() {
    return this.minesService.getRecentResults(20);
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-bets")
  getUserBets(@Req() req: any, @Query("limit") limit?: string) {
    return this.minesService.getUserBets(req.user.userId, limit ? parseInt(limit, 10) : 50);
  }

  // ── Admin endpoints ───────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/stats")
  getAdminStats() {
    return this.minesService.getAdminStats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("admin/stats/reset")
  resetStats() {
    return this.minesService.resetStats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/live")
  getLiveSessions() {
    return this.minesService.getLiveSessions();
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
    return this.minesService.getAdminHistory({
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
      status,
      username,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/config")
  async getConfig() {
    const s = await this.adminService.getPlatformSettings() as any;
    return {
      minesHouseEdge: Number(s.minesHouseEdge  ?? 0.01),
      minesMinBet:    Number(s.minesMinBet     ?? 10),
      minesMaxBet:    Number(s.minesMaxBet     ?? 100000),
      minesEnabled:   s.minesEnabled !== false,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("admin/config")
  saveConfig(@Body() dto: MinesConfigDto) {
    return this.adminService.savePlatformSettings(dto as any);
  }
}
