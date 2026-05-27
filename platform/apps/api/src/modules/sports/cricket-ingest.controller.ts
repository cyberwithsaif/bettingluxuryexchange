import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { CricketIngestService } from "./cricket-ingest.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("sports/cricket")
export class CricketIngestController {
  constructor(private readonly ingest: CricketIngestService) {}

  // Primary: real matches WITH real odds from The Odds API (free tier).
  @Post("sync/live")
  syncLive() { return this.ingest.syncFromOddsApi(); }

  // Secondary: CricAPI (scores only, no odds) — kept for those with a cricapi key.
  @Post("sync/cricapi")
  syncCricapi() { return this.ingest.syncLiveMatches(); }

  @Post("sync/series")
  syncSeries() { return this.ingest.syncSeries(); }

  @Post("sync/series/:id/matches")
  syncMatches(@Param("id") id: string) { return this.ingest.syncSeriesMatches(id); }
}
