import { Controller, Get, Query, UseGuards, Req } from "@nestjs/common";
import { DiceService } from "./dice.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";

@Controller("api/casino/dice")
export class DiceController {
  constructor(private readonly diceService: DiceService) {}

  /** User: personal bet history */
  @UseGuards(JwtAuthGuard)
  @Get("history")
  getUserHistory(@Req() req: any, @Query("limit") limit?: string) {
    return this.diceService.getUserBets(req.user.userId, limit ? parseInt(limit, 10) : 50);
  }

  /** Public: recent dice bets (live feed) */
  @Get("recent")
  getRecent(@Query("limit") limit?: string) {
    return this.diceService.getRecentResults(limit ? parseInt(limit, 10) : 30);
  }

  /** Public: get a fresh server seed hash for provably fair seed rotation */
  @Get("seeds/new")
  getNewSeeds() {
    const { serverSeedHash } = this.diceService.getNewServerSeedHash();
    return { serverSeedHash };
  }

  /** Admin: game stats */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/stats")
  adminStats() {
    return this.diceService.getAdminStats();
  }

  /** Admin: bet history with filters */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/history")
  adminHistory(
    @Query("limit") limit?: string,
    @Query("skip") skip?: string,
    @Query("won") won?: string,
    @Query("username") username?: string,
  ) {
    return this.diceService.getAdminHistory({
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
      won,
      username,
    });
  }
}
