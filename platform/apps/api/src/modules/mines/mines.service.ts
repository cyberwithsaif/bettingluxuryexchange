import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { Prisma, LedgerKind, MinesStatus } from "@prisma/client";
import * as crypto from "crypto";

// House edge for Mines (typically 1%)
const HOUSE_EDGE = 0.01;

function generateMinePositions(serverSeed: string, clientSeed: string, nonce: number, minesCount: number): number[] {
  // Hash logic based on provably fair.
  // Generate random floats using HMAC-SHA256
  const positions: number[] = [];
  const tiles = Array.from({ length: 25 }, (_, i) => i);
  let currentRound = 0;

  while (positions.length < minesCount) {
    const hash = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${currentRound}`).digest('hex');
    // Read 4 bytes chunks to get floats between 0 and 1
    for (let i = 0; i < hash.length / 8 && positions.length < minesCount; i++) {
      const chunk = hash.substring(i * 8, i * 8 + 8);
      const val = parseInt(chunk, 16);
      const float = val / Math.pow(2, 32);
      
      const idx = Math.floor(float * tiles.length);
      const tile = tiles[idx];
      positions.push(tile);
      tiles.splice(idx, 1);
    }
    currentRound++;
  }
  return positions;
}

function calculateMultiplier(minesCount: number, safeClicks: number): number {
  if (safeClicks === 0) return 1.00;
  
  // Comb(25, safeClicks) / Comb(25 - minesCount, safeClicks)
  // This calculates the true odds.
  let n = 25;
  let nMinusMines = 25 - minesCount;
  
  let probability = 1;
  for (let i = 0; i < safeClicks; i++) {
    probability *= (nMinusMines - i) / (n - i);
  }
  
  const trueOdds = 1 / probability;
  // Apply house edge
  const payoutMultiplier = trueOdds * (1 - HOUSE_EDGE);
  return Math.floor(payoutMultiplier * 100) / 100; // Floor to 2 decimal places
}

@Injectable()
export class MinesService {
  private readonly logger = new Logger(MinesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async startGame(userId: string, betAmount: number, minesCount: number, clientSeed: string) {
    if (betAmount < 10) throw new BadRequestException("Minimum bet is 10");
    if (betAmount > 100000) throw new BadRequestException("Maximum bet is 100,000");
    if (minesCount < 1 || minesCount > 24) throw new BadRequestException("Mines count must be between 1 and 24");
    if (!clientSeed) throw new BadRequestException("Client seed required");

    // Deduct bet amount
    await this.wallet.applyLedger({
      userId,
      amount: -betAmount,
      kind: LedgerKind.CASINO_BET,
      refType: "mines_bet",
      refId: "pending", // Will update after creation
      note: `Mines bet (${minesCount} mines)`,
    });

    const serverSeed = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const nonce = 1; // Simplification: we don't strictly track consecutive nonces per user unless requested, use 1.

    const minePositions = generateMinePositions(serverSeed, clientSeed, nonce, minesCount);

    const session = await this.prisma.minesSession.create({
      data: {
        userId,
        betAmount: new Prisma.Decimal(betAmount),
        minesCount,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        status: MinesStatus.IN_PROGRESS,
        multiplier: new Prisma.Decimal(1.00),
        minePositions: minePositions,
        clickedTiles: [],
      },
    });

    // Update refId
    await this.prisma.ledgerEntry.updateMany({
      where: { userId, refType: "mines_bet", refId: "pending" },
      data: { refId: session.id },
    });

    return {
      id: session.id,
      betAmount,
      minesCount,
      serverSeedHash,
      clientSeed,
      nonce,
      status: session.status,
      multiplier: 1.00,
      clickedTiles: [],
    };
  }

  async clickTile(userId: string, sessionId: string, tileIndex: number) {
    if (tileIndex < 0 || tileIndex > 24) throw new BadRequestException("Invalid tile index");

    const session = await this.prisma.minesSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new BadRequestException("Session not found");
    if (session.userId !== userId) throw new BadRequestException("Unauthorized");
    if (session.status !== MinesStatus.IN_PROGRESS) throw new BadRequestException("Game is not in progress");

    const clickedTiles = (session.clickedTiles as any[]) || [];
    if (clickedTiles.find((t) => t.tile === tileIndex)) throw new BadRequestException("Tile already clicked");

    const minePositions = (session.minePositions as number[]) || [];
    const isMine = minePositions.includes(tileIndex);

    if (isMine) {
      // BUSTED
      await this.prisma.minesSession.update({
        where: { id: sessionId },
        data: {
          status: MinesStatus.BUSTED,
          settledAt: new Date(),
          clickedTiles: [...clickedTiles, { tile: tileIndex, isMine: true }],
        },
      });
      return {
        isMine: true,
        status: MinesStatus.BUSTED,
        minePositions, // reveal all mines
        serverSeed: session.serverSeed, // reveal seed for fair verification
      };
    } else {
      // SAFE
      const newClickedCount = clickedTiles.length + 1;
      const nextMultiplier = calculateMultiplier(session.minesCount, newClickedCount);
      
      const newClickedTiles = [...clickedTiles, { tile: tileIndex, isMine: false, multiplier: nextMultiplier }];
      
      // Auto cashout if won all safe tiles (25 - mines)
      const wonAll = newClickedCount === (25 - session.minesCount);
      
      if (wonAll) {
        return this.cashoutInternal(session, newClickedTiles, nextMultiplier, true);
      } else {
        await this.prisma.minesSession.update({
          where: { id: sessionId },
          data: {
            multiplier: new Prisma.Decimal(nextMultiplier),
            clickedTiles: newClickedTiles,
          },
        });

        return {
          isMine: false,
          status: MinesStatus.IN_PROGRESS,
          multiplier: nextMultiplier,
          tileIndex,
        };
      }
    }
  }

  async cashout(userId: string, sessionId: string) {
    const session = await this.prisma.minesSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new BadRequestException("Session not found");
    if (session.userId !== userId) throw new BadRequestException("Unauthorized");
    if (session.status !== MinesStatus.IN_PROGRESS) throw new BadRequestException("Game is not in progress");
    
    const clickedTiles = (session.clickedTiles as any[]) || [];
    if (clickedTiles.length === 0) throw new BadRequestException("Must click at least one tile");

    return this.cashoutInternal(session, clickedTiles, Number(session.multiplier), false);
  }

  private async cashoutInternal(session: any, clickedTiles: any[], multiplier: number, isAutoWin: boolean) {
    const payout = Number(session.betAmount) * multiplier;

    await this.prisma.minesSession.update({
      where: { id: session.id },
      data: {
        status: MinesStatus.CASHED_OUT,
        multiplier: new Prisma.Decimal(multiplier),
        payout: new Prisma.Decimal(payout),
        settledAt: new Date(),
        clickedTiles,
      },
    });

    await this.wallet.applyLedger({
      userId: session.userId,
      amount: payout,
      kind: LedgerKind.CASINO_WIN,
      refType: "mines_win",
      refId: session.id,
      note: `Mines cashout (${multiplier}x)`,
    });

    return {
      status: MinesStatus.CASHED_OUT,
      multiplier,
      payout,
      minePositions: session.minePositions, // reveal
      serverSeed: session.serverSeed, // reveal
    };
  }

  async getRecentResults(limit = 20) {
    return this.prisma.minesSession.findMany({
      where: { status: { in: [MinesStatus.CASHED_OUT, MinesStatus.BUSTED] } },
      orderBy: { settledAt: "desc" },
      take: limit,
      include: {
        user: { select: { username: true } },
      },
    });
  }

  async getUserBets(userId: string, limit = 50) {
    return this.prisma.minesSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
