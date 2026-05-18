import { Controller, Get, Param, Query } from "@nestjs/common";
import { MarketsService } from "./markets.service";

@Controller("markets")
export class MarketsController {
  constructor(private readonly markets: MarketsService) {}

  @Get("sports")
  sports() {
    return this.markets.listSports();
  }

  @Get("matches")
  matches(@Query("sport") sportKey?: string, @Query("inplay") inplay?: string) {
    return this.markets.listMatches(sportKey, inplay === "1" || inplay === "true");
  }

  @Get("match/:id")
  match(@Param("id") id: string) {
    return this.markets.getMatch(id);
  }

  @Get(":id")
  market(@Param("id") id: string) {
    return this.markets.getMarket(id);
  }
}
