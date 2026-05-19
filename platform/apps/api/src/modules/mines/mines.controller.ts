import { Controller, Get, UseGuards, Query, Req } from "@nestjs/common";
import { MinesService } from "./mines.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("mines")
export class MinesController {
  constructor(private readonly minesService: MinesService) {}

  @Get("history")
  async getRecentResults() {
    return this.minesService.getRecentResults(20);
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-bets")
  async getUserBets(@Req() req: any, @Query("limit") limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.minesService.getUserBets(req.user.userId, lim);
  }
}
