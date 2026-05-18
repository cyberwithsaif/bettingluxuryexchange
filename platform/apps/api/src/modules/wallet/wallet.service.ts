import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { LedgerKind, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RedisService } from "../../common/redis/redis.service";

export interface ApplyLedgerInput {
  userId: string;
  kind: LedgerKind;
  // Positive = credit balance, negative = debit balance, 0 = exposure-only entry.
  amount: Prisma.Decimal | number;
  // Positive = lock more exposure, negative = release.
  exposureDelta?: Prisma.Decimal | number;
  refType?: string;
  refId?: string;
  note?: string;
  // If true, balance is allowed to go negative (admin debit, void rollbacks).
  allowNegative?: boolean;
}

const MAX_RETRIES = 5;

/**
 * WalletService is the *only* place wallet rows mutate.
 *
 * Every call to `applyLedger` runs in a Prisma transaction that:
 *  1. reads the wallet row,
 *  2. computes new (balance, exposure),
 *  3. updates the wallet with an optimistic version guard,
 *  4. appends a LedgerEntry row stamped with the post-image.
 *
 * If the version guard fails (concurrent writer), we retry up to
 * MAX_RETRIES times before surfacing a 409.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSummary(userId: string) {
    let w = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!w) {
      w = await this.prisma.wallet.create({ data: { userId } });
    }
    const balance = toNum(w.balance);
    const exposure = toNum(w.exposure);
    const bonus = toNum(w.bonus);
    return {
      balance,
      exposure,
      bonus,
      available: round4(balance - exposure),
      currency: w.currency,
    };
  }

  async applyLedger(input: ApplyLedgerInput) {
    const amount = new Prisma.Decimal(input.amount);
    const expDelta = new Prisma.Decimal(input.exposureDelta ?? 0);

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const out = await this.prisma.$transaction(async (tx) => {
          const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
          if (!wallet) throw new NotFoundException("Wallet not found");

          const newBalance = wallet.balance.add(amount);
          const newExposure = wallet.exposure.add(expDelta);

          if (!input.allowNegative && newBalance.lt(0)) {
            throw new BadRequestException("Insufficient balance");
          }
          if (newExposure.lt(0)) {
            throw new BadRequestException("Exposure would go negative");
          }
          // Spendable check: balance - exposure must remain >= 0 unless admin override.
          if (!input.allowNegative && newBalance.sub(newExposure).lt(0)) {
            throw new BadRequestException("Insufficient available balance");
          }

          const updated = await tx.wallet.updateMany({
            where: { userId: input.userId, version: wallet.version },
            data: {
              balance: newBalance,
              exposure: newExposure,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            // Concurrent write — caller (the retry loop) will retry.
            throw new ConflictException("WALLET_VERSION_CONFLICT");
          }

          const entry = await tx.ledgerEntry.create({
            data: {
              userId: input.userId,
              kind: input.kind,
              amount,
              exposureDelta: expDelta,
              balanceAfter: newBalance,
              exposureAfter: newExposure,
              refType: input.refType,
              refId: input.refId,
              note: input.note,
            },
          });

          return {
            ledgerId: entry.id,
            balance: toNum(newBalance),
            exposure: toNum(newExposure),
            available: round4(toNum(newBalance) - toNum(newExposure)),
          };
        });

        // Notify the user's socket room with the new wallet state.
        await this.redis.publish(`wallet.${input.userId}`, {
          balance: out.balance,
          exposure: out.exposure,
          available: out.available,
        });

        return out;
      } catch (e: any) {
        if (e?.message === "WALLET_VERSION_CONFLICT") {
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    this.logger.error(`Wallet write retries exhausted for user ${input.userId}`);
    throw lastErr ?? new ConflictException("Wallet busy, retry");
  }

  // --- Convenience wrappers ---

  credit(userId: string, amount: number, kind: LedgerKind, ref?: { type: string; id: string }, note?: string) {
    return this.applyLedger({
      userId, kind, amount: Math.abs(amount), refType: ref?.type, refId: ref?.id, note,
    });
  }

  debit(userId: string, amount: number, kind: LedgerKind, ref?: { type: string; id: string }, note?: string, allowNegative = false) {
    return this.applyLedger({
      userId, kind, amount: -Math.abs(amount), refType: ref?.type, refId: ref?.id, note, allowNegative,
    });
  }

  /** Lock liability for an open bet (or any liability). Balance untouched. */
  lockExposure(userId: string, amount: number, refId: string, note?: string) {
    return this.applyLedger({
      userId, kind: LedgerKind.BET_PLACE, amount: 0, exposureDelta: Math.abs(amount),
      refType: "bet", refId, note,
    });
  }

  /** Release previously locked exposure (settlement / cancel / void). */
  releaseExposure(userId: string, amount: number, kind: LedgerKind, refId: string, note?: string) {
    return this.applyLedger({
      userId, kind, amount: 0, exposureDelta: -Math.abs(amount),
      refType: "bet", refId, note,
    });
  }

  /** Settle a bet: release exposure AND apply the net P/L delta to balance. */
  settleBet(opts: { userId: string; refId: string; releaseExposure: number; balanceDelta: number; won: boolean; note?: string }) {
    return this.applyLedger({
      userId: opts.userId,
      kind: opts.won ? LedgerKind.BET_SETTLE_WIN : LedgerKind.BET_SETTLE_LOSS,
      amount: opts.balanceDelta,
      exposureDelta: -Math.abs(opts.releaseExposure),
      refType: "bet",
      refId: opts.refId,
      note: opts.note,
      allowNegative: true, // losses can dip via this same path
    });
  }

  async ledger(userId: string, opts: { limit?: number; cursor?: string } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    return { items: rows.slice(0, limit), nextCursor: hasMore ? rows[limit - 1].id : null };
  }
}

function toNum(d: Prisma.Decimal | number): number {
  return typeof d === "number" ? d : Number(d.toString());
}
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
