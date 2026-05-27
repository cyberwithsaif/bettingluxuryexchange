import { Module } from "@nestjs/common";
import { CricketIngestService } from "./cricket-ingest.service";
import { CricketIngestController } from "./cricket-ingest.controller";
import { BetfairIngestService } from "./betfair-ingest.service";

@Module({
  providers: [CricketIngestService, BetfairIngestService],
  controllers: [CricketIngestController],
  exports: [CricketIngestService, BetfairIngestService],
})
export class SportsModule {}
