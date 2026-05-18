import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { SettlementService } from "./settlement.service";
import { SettlementProcessor } from "./settlement.processor";
import { BettingModule } from "../betting/betting.module";

export const SETTLEMENT_QUEUE = "settlement";

@Module({
  imports: [
    BettingModule,
    BullModule.registerQueue({ name: SETTLEMENT_QUEUE }),
  ],
  providers: [SettlementService, SettlementProcessor],
  exports: [SettlementService],
})
export class SettlementModule {}
