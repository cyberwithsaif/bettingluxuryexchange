import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LedgerKind, Prisma, TransactionKind, TransactionMethod, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { WalletService } from "../../wallet/wallet.service";

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  // -- user-side: submit a deposit/withdrawal request (pending until admin reviews) --
  async request(userId: string, input: { kind: TransactionKind; method: TransactionMethod; amount: number; reference?: string; payload?: Prisma.InputJsonValue }) {
    if (input.amount <= 0) throw new BadRequestException("Amount must be positive");

    // Admin freeze: blocked accounts cannot request withdrawals.
    if (input.kind === TransactionKind.WITHDRAWAL) {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { withdrawalsFrozen: true } });
      if (u?.withdrawalsFrozen) throw new BadRequestException("Withdrawals are frozen on this account. Please contact support.");
    }

    return this.prisma.$transaction(async (tx) => {
      const t = await tx.transaction.create({
        data: {
          userId,
          kind: input.kind,
          method: input.method,
          amount: new Prisma.Decimal(input.amount),
          reference: input.reference,
          payload: input.payload,
          status: TransactionStatus.PENDING,
        },
      });

      // Deduct immediately on withdrawal request so they can't bet with it.
      if (input.kind === TransactionKind.WITHDRAWAL) {
        await this.wallet.applyLedger({
          userId,
          kind: LedgerKind.WITHDRAWAL,
          amount: -input.amount,
          refType: "transaction",
          refId: t.id,
          note: "Withdrawal requested (pending approval)",
        });
      }

      return t;
    });
  }

  list(opts: { status?: TransactionStatus; kind?: TransactionKind; limit?: number; userId?: string } = {}) {
    return this.prisma.transaction.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.kind ? { kind: opts.kind } : {}),
        ...(opts.userId ? { userId: opts.userId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 100, 500),
      include: { user: { select: { id: true, username: true } } },
    });
  }

  async approve(txId: string, reviewerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.transaction.findUnique({ where: { id: txId } });
      if (!t) throw new NotFoundException();
      if (t.status !== "PENDING") throw new BadRequestException("Not pending");

      await tx.transaction.update({
        where: { id: txId },
        data: { status: TransactionStatus.COMPLETED, reviewedById: reviewerId, reviewedAt: new Date() },
      });

      // Only credit wallet on Deposit approval. Withdrawal is already deducted.
      if (t.kind === TransactionKind.DEPOSIT) {
        await this.wallet.applyLedger({
          userId: t.userId,
          kind: LedgerKind.DEPOSIT,
          amount: +Number(t.amount.toString()),
          refType: "transaction",
          refId: t.id,
          note: "Deposit approved",
        });
      }

      return { ok: true };
    });
  }

  async reject(txId: string, reviewerId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.transaction.findUnique({ where: { id: txId } });
      if (!t) throw new NotFoundException();
      if (t.status !== "PENDING") throw new BadRequestException("Not pending");

      await tx.transaction.update({
        where: { id: txId },
        data: { status: TransactionStatus.REJECTED, reviewedById: reviewerId, reviewedAt: new Date(), notes: reason },
      });

      // Refund the withdrawal if rejected
      if (t.kind === TransactionKind.WITHDRAWAL) {
        await this.wallet.applyLedger({
          userId: t.userId,
          kind: LedgerKind.ADMIN_CREDIT,
          amount: +Number(t.amount.toString()),
          refType: "transaction",
          refId: t.id,
          note: "Withdrawal rejected (refund)",
          allowNegative: true,
        });
      }

      return { ok: true };
    });
  }
}
