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
          // Clamp exposure to 0: release-delta can exceed current exposure
          // when bets are cancelled/settled out of order or when opposing bets
          // reduce worst-case exposure. Never let exposure go negative.
          const rawExposure = wallet.exposure.add(expDelta);
          const newExposure = rawExposure.lt(0) ? new Prisma.Decimal(0) : rawExposure;

          if (!input.allowNegative && newBalance.lt(0)) {
            throw new BadRequestException("Insufficient balance");
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

  /**
   * Move `amount` of spendable balance from one wallet to another **atomically**.
   * Both legs (debit source + credit destination) and both LedgerEntry rows are
   * written in a single Prisma transaction with optimistic version guards on each
   * wallet — so the money can never half-move. Used for bookie⇄user transfers.
   *
   * `fromFloor` is the lowest the source balance may reach after the debit
   * (default 0 = no overdraft). Pass a negative number (e.g. -creditLimit) to
   * allow a credit-enabled account to go negative within its limit.
   */
  async transfer(opts: {
    fromUserId: string;
    toUserId: string;
    amount: number;          // must be > 0
    kind: LedgerKind;        // stamped on both legs; sign disambiguates direction
    fromFloor?: number;      // min source balance after debit (default 0)
    refType?: string;
    refId?: string;
    note?: string;
  }) {
    if (opts.fromUserId === opts.toUserId) {
      throw new BadRequestException("Cannot transfer to the same wallet");
    }
    const amt = new Prisma.Decimal(Math.abs(opts.amount));
    if (amt.lte(0)) throw new BadRequestException("Amount must be greater than zero");
    const floor = new Prisma.Decimal(opts.fromFloor ?? 0);

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const out = await this.prisma.$transaction(async (tx) => {
          const from = await tx.wallet.findUnique({ where: { userId: opts.fromUserId } });
          const to = await tx.wallet.findUnique({ where: { userId: opts.toUserId } });
          if (!from) throw new NotFoundException("Source wallet not found");
          if (!to) throw new NotFoundException("Destination wallet not found");

          const newFrom = from.balance.sub(amt);
          if (newFrom.lt(floor)) throw new BadRequestException("Insufficient available balance");
          const newTo = to.balance.add(amt);

          const u1 = await tx.wallet.updateMany({
            where: { userId: opts.fromUserId, version: from.version },
            data: { balance: newFrom, version: { increment: 1 } },
          });
          if (u1.count !== 1) throw new ConflictException("WALLET_VERSION_CONFLICT");

          const u2 = await tx.wallet.updateMany({
            where: { userId: opts.toUserId, version: to.version },
            data: { balance: newTo, version: { increment: 1 } },
          });
          if (u2.count !== 1) throw new ConflictException("WALLET_VERSION_CONFLICT");

          await tx.ledgerEntry.create({
            data: {
              userId: opts.fromUserId, kind: opts.kind, amount: amt.neg(),
              balanceAfter: newFrom, exposureAfter: from.exposure,
              refType: opts.refType, refId: opts.refId, note: opts.note,
            },
          });
          await tx.ledgerEntry.create({
            data: {
              userId: opts.toUserId, kind: opts.kind, amount: amt,
              balanceAfter: newTo, exposureAfter: to.exposure,
              refType: opts.refType, refId: opts.refId, note: opts.note,
            },
          });

          return {
            from: { balance: toNum(newFrom), exposure: toNum(from.exposure), available: round4(toNum(newFrom) - toNum(from.exposure)) },
            to: { balance: toNum(newTo), exposure: toNum(to.exposure), available: round4(toNum(newTo) - toNum(to.exposure)) },
          };
        });

        // Push live wallet updates to both sockets.
        await this.redis.publish(`wallet.${opts.fromUserId}`, out.from);
        await this.redis.publish(`wallet.${opts.toUserId}`, out.to);
        return out;
      } catch (e: any) {
        if (e?.message === "WALLET_VERSION_CONFLICT") { lastErr = e; continue; }
        throw e;
      }
    }
    this.logger.error(`Transfer retries exhausted ${opts.fromUserId} -> ${opts.toUserId}`);
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

  /** Lifetime total of all credits (DEPOSIT + ADMIN_CREDIT) — used for VIP tier. */
  async totalDeposited(userId: string): Promise<number> {
    const result = await this.prisma.ledgerEntry.aggregate({
      where: {
        userId,
        kind: { in: [LedgerKind.DEPOSIT, LedgerKind.ADMIN_CREDIT] },
      },
      _sum: { amount: true },
    });
    return toNum(result._sum.amount ?? 0);
  }
}

function toNum(d: Prisma.Decimal | number): number {
  return typeof d === "number" ? d : Number(d.toString());
}
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
