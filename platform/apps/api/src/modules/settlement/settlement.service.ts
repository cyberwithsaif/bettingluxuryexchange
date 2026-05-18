import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { SETTLEMENT_QUEUE } from "./settlement.module";

export interface SettleJob {
  marketId: string;
  winningRunnerId?: string;
  fancyActual?: number;
  voidMarket?: boolean;
  actorId?: string;
}

@Injectable()
export class SettlementService {
  constructor(@InjectQueue(SETTLEMENT_QUEUE) private readonly queue: Queue) {}

  enqueue(job: SettleJob, opts: { delayMs?: number } = {}) {
    return this.queue.add("settle-market", job, {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 500,
      removeOnFail: 500,
      ...(opts.delayMs ? { delay: opts.delayMs } : {}),
    });
  }
}
