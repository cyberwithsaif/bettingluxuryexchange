import { Body, Controller, Get, Post, UseGuards, Query } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Max, Min, ValidateNested, ArrayMaxSize } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { RouletteService, BetType } from "./roulette.service";

class PlaceBetDto {
  @IsString()
  @IsIn([
    "number","red","black","odd","even","high","low",
    "dozen1","dozen2","dozen3","col1","col2","col3",
    "split","street","corner","sixline",
  ])
  betType!: BetType;

  @IsOptional() @IsString()
  betValue?: string;

  @IsNumber()
  @Min(10)
  @Max(100000)
  amount!: number;
}

class PlaceBatchBetsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PlaceBetDto)
  bets!: PlaceBetDto[];
}

@SkipThrottle()
@Controller("roulette")
export class RouletteController {
  constructor(private readonly service: RouletteService) {}

  @Get("current")
  async current() {
    return this.service.getCurrentRound();
  }

  @Get("history")
  async history(@Query("limit") limit?: string) {
    const n = limit ? Math.min(50, Math.max(1, Number(limit))) : 20;
    return this.service.getRecentResults(n);
  }

  @UseGuards(JwtAuthGuard)
  @Post("bet")
  async placeBet(@CurrentUser() user: AuthUser, @Body() dto: PlaceBetDto) {
    return this.service.placeBet(user.id, {
      betType: dto.betType,
      betValue: dto.betValue ?? null,
      amount: dto.amount,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("bets-batch")
  async placeBatch(@CurrentUser() user: AuthUser, @Body() dto: PlaceBatchBetsDto) {
    const results = [];
    for (const bet of dto.bets) {
      const r = await this.service.placeBet(user.id, {
        betType: bet.betType,
        betValue: bet.betValue ?? null,
        amount: bet.amount,
      });
      results.push(r);
    }
    return { placed: results.length };
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-bets")
  async myBets(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    const n = limit ? Math.min(100, Math.max(1, Number(limit))) : 50;
    return this.service.getUserBets(user.id, n);
  }
}
