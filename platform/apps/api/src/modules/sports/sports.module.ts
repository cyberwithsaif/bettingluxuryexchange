import { Module } from "@nestjs/common";
import { CricketIngestService } from "./cricket-ingest.service";
import { CricketIngestController } from "./cricket-ingest.controller";
import { BetfairIngestService } from "./betfair-ingest.service";
import { EntitySportIngestService } from "./entitysport-ingest.service";

@Module({
  providers: [CricketIngestService, BetfairIngestService, EntitySportIngestService],
  controllers: [CricketIngestController],
  exports: [CricketIngestService, BetfairIngestService, EntitySportIngestService],
})
export class SportsModule {}
