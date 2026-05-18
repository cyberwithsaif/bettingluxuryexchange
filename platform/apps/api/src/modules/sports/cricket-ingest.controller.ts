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

  @Post("sync/series")
  syncSeries() { return this.ingest.syncSeries(); }

  @Post("sync/series/:id/matches")
  syncMatches(@Param("id") id: string) { return this.ingest.syncSeriesMatches(id); }
}
