import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BetSide, BetStatus, LedgerKind, MarketStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { ExposureService } from "../exposure/exposure.service";
import { PlaceBetDto } from "./dto";

/**
 * BettingService — central place where a bet enters the system.
 *
 * placeBet is a single Prisma transaction that:
 *   1. validates the market is OPEN and stake fits user limits,
 *   2. computes potential profit / liability for the bet,
 *   3. uses ExposureService to compute the new market worst-case,
 *   4. asks WalletService to apply an exposure-delta-only ledger entry
 *      (which enforces "balance - exposure >= 0"),
 *   5. inserts the bet row,
 *   6. persists the new MarketExposure.
 *
 * If any step throws, the whole tx rolls back — including the wallet
 * mutation, because WalletService.applyLedger is itself a Prisma tx and
 * we run it inside the outer tx via the `txClient` override below. To
 * keep things simple here we use a single tx and inline the wallet
 * arithmetic rather than nested transactions.
 */
@Injectable()
export class BettingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly exposure: ExposureService,
  ) {}

  async placeBet(userId: string, dto: PlaceBetDto, ip?: string) {
    // Read market+runner+user limits without locking first (fast path).
    const [market, runner, limits] = await Promise.all([
      this.prisma.market.findUnique({ where: { id: dto.marketId }, include: { runners: true, match: true } }),
      this.prisma.runner.findUnique({ where: { id: dto.runnerId } }),
      this.prisma.userLimits.findUnique({ where: { userId } }),
    ]);
    if (!market) throw new NotFoundException("Market not found");
    if (!runner || runner.marketId !== market.id) throw new BadRequestException("Runner not in market");
    if (market.status !== MarketStatus.OPEN) throw new ForbiddenException(`Market is ${market.status.toLowerCase()}`);
    if (market.match.status !== "UPCOMING" && market.match.status !== "LIVE") {
      throw new ForbiddenException("Match is not open for betting");
    }

    // Stake bounds: market-level AND user-level — both must be satisfied.
    const minStake = Math.max(numOf(market.minStake), limits ? numOf(limits.minStake) : 0);
    const maxStake = Math.min(numOf(market.maxStake), limits ? numOf(limits.maxStake) : Infinity);
    if (dto.stake < minStake) throw new BadRequestException(`Min stake is ${minStake}`);
    if (dto.stake > maxStake) throw new BadRequestException(`Max stake is ${maxStake}`);

    // Compute potential profit & per-bet liability (separate from worst-case-per-market).
    const potentialProfit = round4(dto.stake * (dto.odds - 1));
    const liability       = round4(dto.side === BetSide.BACK ? dto.stake : dto.stake * (dto.odds - 1));

    // Build the new exposure picture for (user, market) including this bet.
    const preview = await this.exposure.previewWithBet(userId, market.id, {
      runnerId: dto.runnerId, side: dto.side, stake: dto.stake, odds: dto.odds,
    });

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException("Wallet not found");

    // The wallet exposure column already includes the persisted worst-case
    // for this market. The change to wallet.exposure is exactly preview.delta.
    const newWalletExposure = wallet.exposure.add(new Prisma.Decimal(preview.delta));
    if (wallet.balance.sub(newWalletExposure).lt(0)) {
      throw new BadRequestException("Insufficient available balance");
    }

    // Capture parent chain for downstream commission rollups (snapshot at place-time).
    const parentChain = await this.captureParentChain(userId);

    // -- Transactional commit --
    const result = await this.prisma.$transaction(async (tx) => {
      // Optimistic wallet update guarded by version.
      const updated = await tx.wallet.updateMany({
        where: { userId, version: wallet.version },
        data: {
          exposure: newWalletExposure,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new BadRequestException("Wallet busy, please retry");

      const bet = await tx.bet.create({
        data: {
          userId,
          marketId: market.id,
          runnerId: dto.runnerId,
          side: dto.side,
          odds: new Prisma.Decimal(dto.odds),
          stake: new Prisma.Decimal(dto.stake),
          fancyValue: dto.fancyValue,
          potentialProfit: new Prisma.Decimal(potentialProfit),
          liability: new Prisma.Decimal(liability),
          status: BetStatus.OPEN,
          parentChain: parentChain as unknown as Prisma.InputJsonValue,
          placedFromIp: ip,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId,
          kind: LedgerKind.BET_PLACE,
          amount: new Prisma.Decimal(0),
          exposureDelta: new Prisma.Decimal(preview.delta),
          balanceAfter: wallet.balance,
          exposureAfter: newWalletExposure,
          refType: "bet",
          refId: bet.id,
          note: `Place ${dto.side} ${dto.stake}@${dto.odds} on ${runner.name}`,
        },
      });

      await this.exposure.persistInTx(tx, userId, market.id, preview.after);

      return { bet, newExposure: numOf(newWalletExposure), balance: numOf(wallet.balance) };
    });

    return {
      betId: result.bet.id,
      status: result.bet.status,
      potentialProfit,
      potentialLiability: liability,
      newBalance: result.balance,
      newExposure: result.newExposure,
    };
  }

  /**
   * Settle a market: marks every OPEN bet as won/lost, releases its
   * exposure, applies the win/loss delta to wallet.balance, recomputes
   * MarketExposure for affected users, and persists the result on the
   * market row.
   *
   * For fancy markets, pass `fancyActual` (e.g. actual runs scored) and
   * we'll evaluate each bet's `fancyValue` against it (>= → YES wins).
   * For match-odds / bookmaker, pass `winningRunnerId`.
   */
  async settleMarket(opts: {
    marketId: string;
    winningRunnerId?: string;
    fancyActual?: number;
    voidMarket?: boolean;
  }) {
    const market = await this.prisma.market.findUnique({
      where: { id: opts.marketId },
      include: { runners: true, bets: { where: { status: BetStatus.OPEN } } },
    });
    if (!market) throw new NotFoundException("Market not found");
    if (market.status === MarketStatus.SETTLED) throw new BadRequestException("Already settled");

    const userIds = new Set(market.bets.map((b) => b.userId));

    for (const bet of market.bets) {
      const won = opts.voidMarket
        ? null
        : this.isBetWinner(bet, opts.winningRunnerId, opts.fancyActual);

      // For each settled bet:
      //   - Release its share of exposure (computed as the market worst-case delta
      //     between "before this bet" and "without this bet"). But since we settle
      //     the entire market at once per user, we instead recompute exposure
      //     from scratch for each affected user AFTER all their bets in this
      //     market are closed → so per-bet exposure release equals the existing
      //     MarketExposure.worstCase divided proportionally is unnecessary; we
      //     simply zero out MarketExposure for the market and subtract it from
      //     wallet.exposure once per user.

      let balanceDelta = 0;
      let newStatus: BetStatus;
      if (won === null) {
        // Void — stake returned, no balance change since exchange model doesn't debit stake.
        balanceDelta = 0;
        newStatus = BetStatus.VOID;
      } else if (won) {
        balanceDelta = numOf(bet.potentialProfit);
        newStatus = BetStatus.SETTLED_WON;
      } else {
        balanceDelta = -numOf(bet.liability);
        newStatus = BetStatus.SETTLED_LOST;
      }

      await this.prisma.bet.update({
        where: { id: bet.id },
        data: { status: newStatus, settledAt: new Date(), voidReason: won === null ? "market_void" : undefined },
      });

      if (balanceDelta !== 0) {
        await this.wallet.applyLedger({
          userId: bet.userId,
          kind: won ? LedgerKind.BET_SETTLE_WIN : LedgerKind.BET_SETTLE_LOSS,
          amount: balanceDelta,
          exposureDelta: 0,
          refType: "bet",
          refId: bet.id,
          allowNegative: true,
          note: `Settled ${newStatus.replace("SETTLED_", "")} on market ${market.name}`,
        });
      }
    }

    // Release each affected user's market exposure to 0 and rebate it from wallet.exposure.
    for (const userId of userIds) {
      const me = await this.prisma.marketExposure.findUnique({
        where: { userId_marketId: { userId, marketId: market.id } },
      });
      const lockedHere = me ? numOf(me.worstCase) : 0;
      if (lockedHere > 0) {
        await this.wallet.applyLedger({
          userId,
          kind: LedgerKind.BET_SETTLE_WIN, // exposure-release entry (no balance change)
          amount: 0,
          exposureDelta: -lockedHere,
          refType: "market",
          refId: market.id,
          note: `Release exposure on settled market`,
        });
      }
      await this.prisma.marketExposure.deleteMany({
        where: { userId, marketId: market.id },
      });
    }

    await this.prisma.market.update({
      where: { id: market.id },
      data: {
        status: opts.voidMarket ? MarketStatus.VOID : MarketStatus.SETTLED,
        result: {
          winningRunnerId: opts.winningRunnerId ?? null,
          fancyActual: opts.fancyActual ?? null,
          settledAt: new Date().toISOString(),
        },
      },
    });

    return { settledBets: market.bets.length, affectedUsers: userIds.size };
  }

  private isBetWinner(
    bet: { runnerId: string; side: BetSide; fancyValue: number | null },
    winningRunnerId?: string,
    fancyActual?: number,
  ): boolean {
    if (typeof fancyActual === "number" && bet.fancyValue !== null && bet.fancyValue !== undefined) {
      // Fancy / over-runs / session: YES wins if actual >= target, NO wins otherwise.
      // Convention: runner whose name maps to "YES" wins when actual >= target.
      // Since we don't enforce names here, we treat BACK on a bet with fancyValue
      // as "betting that actual >= fancyValue".
      const yesWins = fancyActual >= bet.fancyValue;
      return bet.side === BetSide.BACK ? yesWins : !yesWins;
    }
    // Match odds / bookmaker / etc.
    const onWinningRunner = bet.runnerId === winningRunnerId;
    return bet.side === BetSide.BACK ? onWinningRunner : !onWinningRunner;
  }

  async cancelBet(userId: string, betId: string, byRole: UserRole) {
    const bet = await this.prisma.bet.findUnique({ where: { id: betId }, include: { market: true } });
    if (!bet) throw new NotFoundException("Bet not found");
    if (bet.userId !== userId && byRole === UserRole.USER) throw new ForbiddenException();
    if (bet.status !== BetStatus.OPEN) throw new BadRequestException("Bet not open");

    await this.prisma.bet.update({
      where: { id: betId },
      data: { status: BetStatus.CANCELLED, settledAt: new Date(), voidReason: "user_cancel" },
    });

    // Rebuild this user's market exposure without the cancelled bet.
    const newExp = await this.exposure.recompute(userId, bet.marketId);
    // Sync wallet.exposure with the delta.
    const prev = bet.market;
    const me = await this.prisma.marketExposure.findUnique({
      where: { userId_marketId: { userId, marketId: bet.marketId } },
    });
    const persistedWorst = me ? numOf(me.worstCase) : 0;
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    const desired = persistedWorst;
    // Walk to desired via WalletService so we get a ledger entry.
    if (wallet) {
      const totalAcrossMarkets = numOf(wallet.exposure);
      // Approximation: assume previous market exposure was the old persistedWorst.
      // We just persisted newExp.worstCase. The delta is (new - old) — but we already
      // wrote new in DB. Reconstruct old via aggregation isn't worth it for cancel
      // path; simpler: recompute aggregated exposure from MarketExposure rows.
      const agg = await this.prisma.marketExposure.aggregate({
        where: { userId },
        _sum: { worstCase: true },
      });
      const target = numOf(agg._sum.worstCase ?? new Prisma.Decimal(0));
      const delta = target - totalAcrossMarkets;
      if (delta !== 0) {
        await this.wallet.applyLedger({
          userId,
          kind: LedgerKind.BET_CANCEL,
          amount: 0,
          exposureDelta: delta,
          refType: "bet",
          refId: betId,
          note: "Bet cancelled",
        });
      }
    }
    void prev; void desired;
    return { ok: true };
  }

  // Build the parent chain for commission snapshots, capped at 6 levels up.
  private async captureParentChain(userId: string) {
    const chain: Array<{ userId: string; role: string; partnershipBps: number }> = [];
    let curId: string | null = userId;
    for (let depth = 0; depth < 6; depth++) {
      if (!curId) break;
      const u: { id: string; parentId: string | null; role: string; partnershipBps: number } | null =
        await this.prisma.user.findUnique({
          where: { id: curId },
          select: { id: true, parentId: true, role: true, partnershipBps: true },
        });
      if (!u || !u.parentId) break;
      chain.push({ userId: u.parentId, role: u.role, partnershipBps: u.partnershipBps });
      curId = u.parentId;
    }
    return chain;
  }

  // -- Reads --

  listMyBets(userId: string, status?: BetStatus) {
    return this.prisma.bet.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      include: { market: { include: { match: true } }, runner: true },
      take: 100,
    });
  }

  getMarketExposure(userId: string, marketId: string) {
    return this.prisma.marketExposure.findUnique({
      where: { userId_marketId: { userId, marketId } },
    });
  }
}

function numOf(d: Prisma.Decimal | number): number {
  return typeof d === "number" ? d : Number(d.toString());
}
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
