import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LedgerKind, Prisma, TransactionKind, TransactionMethod, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { WalletService } from "../../wallet/wallet.service";
import { AdminService } from "../admin.service";

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly admin: AdminService,
  ) {}

  // -- user-side: submit a deposit/withdrawal request (pending until admin reviews) --
  async request(userId: string, input: { kind: TransactionKind; method: TransactionMethod; amount: number; reference?: string; payload?: Prisma.InputJsonValue }) {
    if (input.amount <= 0) throw new BadRequestException("Amount must be positive");

    // Platform-wide toggles + limits (admin Settings page).
    const s = (await this.admin.getPlatformSettings()) as Record<string, any>;
    if (input.kind === TransactionKind.DEPOSIT && s.depositEnabled === false) {
      throw new BadRequestException("Deposits are temporarily disabled.");
    }
    if (input.kind === TransactionKind.WITHDRAWAL) {
      if (s.withdrawalEnabled === false) throw new BadRequestException("Withdrawals are temporarily disabled.");
      const min = Number(s.minWithdrawal ?? 0);
      const max = Number(s.maxWithdrawal ?? Infinity);
      if (min > 0 && input.amount < min) throw new BadRequestException(`Minimum withdrawal is ₹${min.toLocaleString("en-IN")}`);
      if (max > 0 && input.amount > max) throw new BadRequestException(`Maximum withdrawal is ₹${max.toLocaleString("en-IN")}`);
      // Admin freeze: blocked accounts cannot request withdrawals.
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

  // -- user-side: saved payout methods (UPI / bank / crypto) --
  listPayoutMethods(userId: string) {
    return this.prisma.userPayoutMethod.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  }

  async addPayoutMethod(userId: string, dto: { type: string; label: string; details: string }) {
    if (!["UPI", "BANK_TRANSFER", "CRYPTO"].includes(dto.type)) throw new BadRequestException("Invalid method type");
    if (!dto.label?.trim() || !dto.details?.trim()) throw new BadRequestException("Label and details are required");
    return this.prisma.userPayoutMethod.create({
      data: { userId, type: dto.type, label: dto.label.trim(), details: dto.details.trim() },
    });
  }

  async removePayoutMethod(userId: string, id: string) {
    const m = await this.prisma.userPayoutMethod.findUnique({ where: { id } });
    if (!m || m.userId !== userId) throw new NotFoundException("Method not found");
    await this.prisma.userPayoutMethod.delete({ where: { id } });
    return { ok: true };
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
