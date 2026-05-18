import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { BettingService } from "../betting/betting.service";
import { SETTLEMENT_QUEUE } from "./settlement.constants";
import type { SettleJob } from "./settlement.service";

@Processor(SETTLEMENT_QUEUE)
export class SettlementProcessor extends WorkerHost {
  private readonly logger = new Logger(SettlementProcessor.name);
  constructor(private readonly betting: BettingService) { super(); }

  async process(job: Job<SettleJob>): Promise<unknown> {
    this.logger.log(`Processing settlement job market=${job.data.marketId}`);
    return this.betting.settleMarket({
      marketId: job.data.marketId,
      winningRunnerId: job.data.winningRunnerId,
      fancyActual: job.data.fancyActual,
      voidMarket: job.data.voidMarket,
    });
  }
}
