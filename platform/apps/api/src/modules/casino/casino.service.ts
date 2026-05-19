import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as crypto from "crypto";
import { CasinoCategory, CasinoTxKind, LedgerKind } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";

/**
 * Casino integration layer (seamless-wallet model).
 *
 * Real provider integrations (Evolution, Pragmatic, etc.) implement the
 * same wallet-callback contract — `bet`, `win`, `refund`, `rollback` —
 * each with a unique externalRef per round. We dedupe on
 * (sessionId, externalRef, kind) so replayed callbacks are idempotent.
 */
@Injectable()
export class CasinoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  listGames(opts: { category?: CasinoCategory; providerKey?: string; q?: string } = {}) {
    return this.prisma.casinoGame.findMany({
      where: {
        isActive: true,
        ...(opts.category ? { category: opts.category } : {}),
        ...(opts.providerKey ? { provider: { key: opts.providerKey } } : {}),
        ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" } } : {}),
      },
      include: { provider: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 200,
    });
  }

  listProviders() {
    return this.prisma.casinoProvider.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async openSession(userId: string, gameId: string) {
    const game = await this.prisma.casinoGame.findUnique({ where: { id: gameId }, include: { provider: true } });
    if (!game?.isActive) throw new NotFoundException("Game not found");
    const limits = await this.prisma.userLimits.findUnique({ where: { userId } });
    if (limits && !limits.casinoEnabled) throw new BadRequestException("Casino disabled for user");

    const providerToken = crypto.randomBytes(24).toString("base64url");
    const session = await this.prisma.casinoSession.create({
      data: { userId, gameId, providerToken },
    });
    // The launch URL would normally be built per provider; here we return a
    // generic shape the frontend can adapt or open as iframe.
    return {
      sessionId: session.id,
      providerToken,
      provider: game.provider.key,
      launchUrl: `/casino/launch/${session.id}`,
    };
  }

  /**
   * Provider wallet callback — invoked by the provider with the session token.
   * Posts a deduped CasinoTransaction and an atomic ledger entry.
   */
  async walletCallback(input: {
    providerToken: string;
    kind: CasinoTxKind;
    amount: number;
    externalRef: string;
    roundId?: string;
  }) {
    const session = await this.prisma.casinoSession.findUnique({
      where: { providerToken: input.providerToken },
      include: { user: true },
    });
    if (!session) throw new NotFoundException("Session not found");

    // Idempotency on (sessionId, externalRef, kind).
    const existing = await this.prisma.casinoTransaction.findUnique({
      where: { sessionId_externalRef_kind: { sessionId: session.id, externalRef: input.externalRef, kind: input.kind } },
    }).catch(() => null);
    if (existing) {
      const w = await this.wallet.getSummary(session.userId);
      return { balance: w.balance, deduped: true };
    }

    let ledgerKind: LedgerKind;
    let signedAmount: number;
    switch (input.kind) {
      case CasinoTxKind.BET:      ledgerKind = LedgerKind.CASINO_BET;     signedAmount = -Math.abs(input.amount); break;
      case CasinoTxKind.WIN:      ledgerKind = LedgerKind.CASINO_WIN;     signedAmount = +Math.abs(input.amount); break;
      case CasinoTxKind.REFUND:   ledgerKind = LedgerKind.CASINO_REFUND;  signedAmount = +Math.abs(input.amount); break;
      case CasinoTxKind.ROLLBACK: ledgerKind = LedgerKind.ROLLBACK;       signedAmount = +Math.abs(input.amount); break;
      default: throw new BadRequestException("Unknown txn kind");
    }

    // Write the ledger first; if it fails (e.g. insufficient balance on BET),
    // we never persist the casino transaction.
    const ledger = await this.wallet.applyLedger({
      userId: session.userId,
      kind: ledgerKind,
      amount: signedAmount,
      refType: "casino_session",
      refId: session.id,
      note: `${input.kind} (round=${input.roundId ?? "-"})`,
      allowNegative: input.kind !== CasinoTxKind.BET,
    });

    try {
      await this.prisma.casinoTransaction.create({
        data: {
          sessionId: session.id,
          externalRef: input.externalRef,
          kind: input.kind,
          amount: Math.abs(input.amount),
          roundId: input.roundId,
        },
      });
    } catch (e) {
      // Unique violation → callback was racing; treat as success.
      if ((e as { code?: string }).code === "P2002") {
        return { balance: ledger.balance, deduped: true };
      }
      throw e;
    }

    return { balance: ledger.balance };
  }

  closeSession(sessionId: string) {
    return this.prisma.casinoSession.update({
      where: { id: sessionId },
      data: { closedAt: new Date() },
    });
  }

  // ── Admin CRUD ────────────────────────────────────────────────────────────────────

  createProvider(dto: { name: string; key: string; category: string }) {
    return this.prisma.casinoProvider.create({
      data: { name: dto.name, key: dto.key, isActive: true },
    });
  }

  deleteProvider(id: string) {
    return this.prisma.casinoProvider.update({
      where: { id },
      data: { isActive: false },
    });
  }

  createGame(dto: { name: string; providerId: string; category: string; thumbnail?: string; isLive?: boolean }) {
    return this.prisma.casinoGame.create({
      data: {
        name: dto.name,
        externalId: dto.name.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + Date.now(),
        providerId: dto.providerId,
        category: dto.category as any,
        thumbnail: dto.thumbnail ?? null,
        isLive: dto.isLive ?? false,
        isActive: true,
        sortOrder: 0,
      },
      include: { provider: true },
    });
  }

  deleteGame(id: string) {
    return this.prisma.casinoGame.update({
      where: { id },
      data: { isActive: false },
    });
  }

  updateGame(id: string, dto: { name?: string; thumbnail?: string | null; isLive?: boolean; category?: string; sortOrder?: number }) {
    return this.prisma.casinoGame.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.thumbnail !== undefined ? { thumbnail: dto.thumbnail } : {}),
        ...(dto.isLive !== undefined ? { isLive: dto.isLive } : {}),
        ...(dto.category !== undefined ? { category: dto.category as any } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: { provider: true },
    });
  }
}
