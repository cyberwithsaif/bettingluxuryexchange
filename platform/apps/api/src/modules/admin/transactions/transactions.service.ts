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
  request(userId: string, input: { kind: TransactionKind; method: TransactionMethod; amount: number; reference?: string; payload?: Prisma.InputJsonValue }) {
    if (input.amount <= 0) throw new BadRequestException("Amount must be positive");
    return this.prisma.transaction.create({
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

      // Mark as approved + completed in one shot
      await tx.transaction.update({
        where: { id: txId },
        data: { status: TransactionStatus.COMPLETED, reviewedById: reviewerId, reviewedAt: new Date() },
      });

      const signed = t.kind === TransactionKind.DEPOSIT ? +Number(t.amount.toString()) : -Number(t.amount.toString());
      const kind = t.kind === TransactionKind.DEPOSIT ? LedgerKind.DEPOSIT : LedgerKind.WITHDRAWAL;

      // Use WalletService outside the tx for simplicity (its own tx) — chained.
      // Edge case: if wallet write fails after we've marked the row completed,
      // we rollback the outer tx via throwing.
      await this.wallet.applyLedger({
        userId: t.userId,
        kind,
        amount: signed,
        refType: "transaction",
        refId: t.id,
        note: `${t.kind} approved`,
        allowNegative: t.kind === TransactionKind.WITHDRAWAL,
      });
      return { ok: true };
    });
  }

  async reject(txId: string, reviewerId: string, reason?: string) {
    const t = await this.prisma.transaction.findUnique({ where: { id: txId } });
    if (!t) throw new NotFoundException();
    if (t.status !== "PENDING") throw new BadRequestException("Not pending");
    return this.prisma.transaction.update({
      where: { id: txId },
      data: { status: TransactionStatus.REJECTED, reviewedById: reviewerId, reviewedAt: new Date(), notes: reason },
    });
  }
}
