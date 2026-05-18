import { Module } from "@nestjs/common";
import { CricketIngestService } from "./cricket-ingest.service";
import { CricketIngestController } from "./cricket-ingest.controller";

@Module({
  providers: [CricketIngestService],
  controllers: [CricketIngestController],
  exports: [CricketIngestService],
})
export class SportsModule {}
