import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { CricketIngestService } from "./cricket-ingest.service";
import { BetfairIngestService } from "./betfair-ingest.service";
import { EntitySportIngestService } from "./entitysport-ingest.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("sports")
export class CricketIngestController {
  constructor(
    private readonly ingest: CricketIngestService,
    private readonly betfair: BetfairIngestService,
    private readonly entity: EntitySportIngestService,
  ) {}

  // Primary: real matches WITH real odds from The Odds API (free tier).
  @Post("cricket/sync/live")
  syncLive() { return this.ingest.syncFromOddsApi(); }

  // Betfair Exchange — authentic back/lay cricket match odds.
  @Post("betfair/sync")
  syncBetfair() { return this.betfair.syncCricketMatchOdds(); }

  // EntitySport (India-accessible) — matches + odds + session (paid plan).
  @Post("entitysport/sync")
  syncEntitySport() { return this.entity.syncMatches(); }

  // Secondary: CricAPI (scores only, no odds) — kept for those with a cricapi key.
  @Post("cricket/sync/cricapi")
  syncCricapi() { return this.ingest.syncLiveMatches(); }

  @Post("cricket/sync/series")
  syncSeries() { return this.ingest.syncSeries(); }

  @Post("cricket/sync/series/:id/matches")
  syncMatches(@Param("id") id: string) { return this.ingest.syncSeriesMatches(id); }
}
