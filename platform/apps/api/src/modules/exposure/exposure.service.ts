import { Injectable } from "@nestjs/common";
import { Prisma, BetSide, Bet, Runner } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface SimulatedBet {
  runnerId: string;
  side: BetSide;
  stake: number;
  odds: number;
}

export interface ExposureResult {
  // Net P/L per runner (in major currency units), keyed by runner id.
  runnerPL: Record<string, number>;
  // Worst-case (most negative) outcome — i.e. the max loss across runners.
  // Always returned as a non-negative number (it is what we lock in wallet.exposure).
  worstCase: number;
}

/**
 * Pure book-keeping for back/lay exposure.
 *
 * For a single bet b on runner R at odds O, stake S:
 *
 *   BACK b on R wins  →  P/L = +S*(O-1)
 *   BACK b on R loses →  P/L = -S
 *   LAY  b on R wins  →  P/L = -S*(O-1)
 *   LAY  b on R loses →  P/L = +S
 *
 * For each runner X, sum the P/L "if X wins" over all of the user's
 * open bets on this market. The market exposure to lock in the user's
 * wallet is the max loss across runners, floored at 0 (we don't refund
 * wins out of exposure).
 *
 * Fancy markets are modelled as 2-runner (YES / NO) markets for v1.
 */
@Injectable()
export class ExposureService {
  constructor(private readonly prisma: PrismaService) {}

  computeFromBets(runners: Pick<Runner, "id">[], bets: SimulatedBet[]): ExposureResult {
    const pl: Record<string, number> = {};
    for (const r of runners) pl[r.id] = 0;

    for (const b of bets) {
      const winSign = b.side === "BACK" ? +1 : -1;
      const winAmount = b.stake * (b.odds - 1);
      const loseAmount = b.stake;

      for (const r of runners) {
        if (r.id === b.runnerId) {
          pl[r.id] = (pl[r.id] ?? 0) + winSign * winAmount;
        } else {
          pl[r.id] = (pl[r.id] ?? 0) + (b.side === "BACK" ? -loseAmount : +loseAmount);
        }
      }
    }

    // Round to 4dp to match Decimal(20,4) storage.
    for (const k of Object.keys(pl)) pl[k] = round4(pl[k]);

    const minPL = Math.min(0, ...Object.values(pl));
    return { runnerPL: pl, worstCase: round4(Math.max(0, -minPL)) };
  }

  /**
   * Read open bets from DB and compute (a) the current persisted exposure
   * for this market, and (b) what it would become if `proposed` is added.
   * Returns the *delta* to apply to wallet.exposure.
   */
  async previewWithBet(userId: string, marketId: string, proposed: SimulatedBet) {
    const [existingBets, runners, persisted] = await Promise.all([
      this.prisma.bet.findMany({
        where: { userId, marketId, status: { in: ["OPEN"] } },
        select: { runnerId: true, side: true, stake: true, odds: true },
      }),
      this.prisma.runner.findMany({ where: { marketId }, select: { id: true } }),
      this.prisma.marketExposure.findUnique({ where: { userId_marketId: { userId, marketId } } }),
    ]);

    const currentBets: SimulatedBet[] = existingBets.map((b) => ({
      runnerId: b.runnerId,
      side: b.side,
      stake: Number(b.stake.toString()),
      odds: Number(b.odds.toString()),
    }));

    const before = this.computeFromBets(runners, currentBets);
    const after = this.computeFromBets(runners, [...currentBets, proposed]);
    const persistedWorst = persisted ? Number(persisted.worstCase.toString()) : 0;

    return {
      before,
      after,
      persistedWorst,
      delta: round4(after.worstCase - persistedWorst),
    };
  }

  /**
   * Atomically persist the new MarketExposure row inside a caller's
   * Prisma transaction (used by BettingService.placeBet).
   */
  async persistInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    marketId: string,
    result: ExposureResult,
  ) {
    await tx.marketExposure.upsert({
      where: { userId_marketId: { userId, marketId } },
      create: { userId, marketId, runnerPL: result.runnerPL, worstCase: result.worstCase },
      update:  { runnerPL: result.runnerPL, worstCase: result.worstCase },
    });
  }

  /** Recompute market exposure from scratch (used after settlement). */
  async recompute(userId: string, marketId: string): Promise<ExposureResult> {
    const [bets, runners] = await Promise.all([
      this.prisma.bet.findMany({
        where: { userId, marketId, status: "OPEN" },
        select: { runnerId: true, side: true, stake: true, odds: true },
      }),
      this.prisma.runner.findMany({ where: { marketId }, select: { id: true } }),
    ]);
    const simulated: SimulatedBet[] = bets.map((b) => ({
      runnerId: b.runnerId, side: b.side,
      stake: Number(b.stake.toString()), odds: Number(b.odds.toString()),
    }));
    const result = this.computeFromBets(runners, simulated);
    await this.prisma.marketExposure.upsert({
      where: { userId_marketId: { userId, marketId } },
      create: { userId, marketId, runnerPL: result.runnerPL, worstCase: result.worstCase },
      update:  { runnerPL: result.runnerPL, worstCase: result.worstCase },
    });
    return result;
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
