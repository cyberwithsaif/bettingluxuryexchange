import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { BettingService } from "./betting.service";
import { PlaceBetDto } from "./dto";
import { BetStatus, UserRole } from "@prisma/client";

@UseGuards(JwtAuthGuard)
@Controller("bets")
export class BettingController {
  constructor(private readonly betting: BettingService) {}

  @Post()
  place(@CurrentUser() user: AuthUser, @Body() dto: PlaceBetDto, @Req() req: Request) {
    return this.betting.placeBet(user.id, dto, req.ip);
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthUser, @Query("status") status?: BetStatus) {
    return this.betting.listMyBets(user.id, status);
  }

  @Get("market/:marketId/exposure")
  marketExposure(@CurrentUser() user: AuthUser, @Param("marketId") marketId: string) {
    return this.betting.getMarketExposure(user.id, marketId);
  }

  @Delete(":id")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.betting.cancelBet(user.id, id, user.role as UserRole);
  }
}
