import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { AdminService } from "../admin/admin.service";
import { Prisma, LedgerKind, MinesStatus } from "@prisma/client";
import * as crypto from "crypto";

function generateMinePositions(serverSeed: string, clientSeed: string, nonce: number, minesCount: number): number[] {
  const positions: number[] = [];
  const tiles = Array.from({ length: 25 }, (_, i) => i);
  let currentRound = 0;
  while (positions.length < minesCount) {
    const hash = crypto.createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:${currentRound}`).digest("hex");
    for (let i = 0; i < hash.length / 8 && positions.length < minesCount; i++) {
      const chunk = hash.substring(i * 8, i * 8 + 8);
      const val = parseInt(chunk, 16);
      const float = val / Math.pow(2, 32);
      const idx = Math.floor(float * tiles.length);
      const tile = tiles[idx];
      positions.push(tile!);
      tiles.splice(idx, 1);
    }
    currentRound++;
  }
  return positions;
}

function calculateMultiplier(minesCount: number, safeClicks: number, houseEdge: number): number {
  if (safeClicks === 0) return 1.00;
  const n = 25;
  const nMinusMines = 25 - minesCount;
  let probability = 1;
  for (let i = 0; i < safeClicks; i++) {
    probability *= (nMinusMines - i) / (n - i);
  }
  const trueOdds = 1 / probability;
  const payoutMultiplier = trueOdds * (1 - houseEdge);
  return Math.floor(payoutMultiplier * 100) / 100;
}

@Injectable()
export class MinesService {
  private readonly logger = new Logger(MinesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly adminService: AdminService,
  ) {}

  private async getConfig() {
    const settings = await this.adminService.getPlatformSettings() as any;
    return {
      houseEdge:  Number(settings.minesHouseEdge  ?? 0.01),
      minBet:     Number(settings.minesMinBet     ?? 10),
      maxBet:     Number(settings.minesMaxBet     ?? 100000),
      enabled:    settings.minesEnabled !== false,
      // 0 = fair, 1–100 = extra bust chance % per safe click
      hardness:   Math.min(100, Math.max(0, Number(settings.minesHardness ?? 0))),
    };
  }

  async startGame(userId: string, betAmount: number, minesCount: number, clientSeed: string) {
    const cfg = await this.getConfig();
    if (!cfg.enabled) throw new BadRequestException("Mines game is currently disabled");
    if (betAmount < cfg.minBet) throw new BadRequestException(`Minimum bet is ${cfg.minBet}`);
    if (betAmount > cfg.maxBet) throw new BadRequestException(`Maximum bet is ${cfg.maxBet}`);
    if (minesCount < 1 || minesCount > 24) throw new BadRequestException("Mines count must be between 1 and 24");
    if (!clientSeed) throw new BadRequestException("Client seed required");

    await this.wallet.applyLedger({
      userId,
      amount: -betAmount,
      kind: LedgerKind.CASINO_BET,
      refType: "mines_bet",
      refId: "pending",
      note: `Mines bet (${minesCount} mines)`,
    });

    const serverSeed = crypto.randomBytes(32).toString("hex");
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const nonce = 1;
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
        minePositions,
        clickedTiles: [],
      },
    });

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
      await this.prisma.minesSession.update({
        where: { id: sessionId },
        data: {
          status: MinesStatus.BUSTED,
          settledAt: new Date(),
          clickedTiles: [...clickedTiles, { tile: tileIndex, isMine: true }],
        },
      });
      return {
        isMine: true as const,
        status: MinesStatus.BUSTED,
        minePositions,
        serverSeed: session.serverSeed,
      };
    } else {
      const cfg = await this.getConfig();

      // Hardness: extra probability to force a bust on a safe tile
      if (cfg.hardness > 0 && Math.random() * 100 < cfg.hardness) {
        await this.prisma.minesSession.update({
          where: { id: sessionId },
          data: {
            status: MinesStatus.BUSTED,
            settledAt: new Date(),
            clickedTiles: [...clickedTiles, { tile: tileIndex, isMine: true }],
          },
        });
        return {
          isMine: true as const,
          status: MinesStatus.BUSTED,
          minePositions: [...minePositions, tileIndex], // show clicked tile as mine
          serverSeed: session.serverSeed,
        };
      }

      const newClickedCount = clickedTiles.length + 1;
      const nextMultiplier = calculateMultiplier(session.minesCount, newClickedCount, cfg.houseEdge);
      const newClickedTiles = [...clickedTiles, { tile: tileIndex, isMine: false, multiplier: nextMultiplier }];
      const wonAll = newClickedCount === (25 - session.minesCount);

      if (wonAll) {
        return this.cashoutInternal(session, newClickedTiles, nextMultiplier, true);
      } else {
        await this.prisma.minesSession.update({
          where: { id: sessionId },
          data: { multiplier: new Prisma.Decimal(nextMultiplier), clickedTiles: newClickedTiles },
        });
        return {
          isMine: false as const,
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
      minePositions: session.minePositions,
      serverSeed: session.serverSeed,
    };
  }

  async getAdminStats() {
    const [total, active, wins, busts] = await Promise.all([
      this.prisma.minesSession.count(),
      this.prisma.minesSession.count({ where: { status: MinesStatus.IN_PROGRESS } }),
      this.prisma.minesSession.findMany({
        where: { status: MinesStatus.CASHED_OUT },
        select: { betAmount: true, payout: true },
      }),
      this.prisma.minesSession.findMany({
        where: { status: MinesStatus.BUSTED },
        select: { betAmount: true },
      }),
    ]);
    const totalBetsVol = [...wins.map(w => Number(w.betAmount)), ...busts.map(b => Number(b.betAmount))].reduce((s, v) => s + v, 0);
    const totalPayouts = wins.reduce((s, w) => s + Number(w.payout), 0);
    const houseProfit = totalBetsVol - totalPayouts;
    return { total, active, totalBetsVol, totalPayouts, houseProfit };
  }

  async getLiveSessions() {
    // Auto-expire sessions older than 2 hours
    await this.expireStale(120);
    return this.prisma.minesSession.findMany({
      where: { status: MinesStatus.IN_PROGRESS },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async expireStale(maxAgeMinutes = 120) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const stale = await this.prisma.minesSession.findMany({
      where: { status: MinesStatus.IN_PROGRESS, createdAt: { lt: cutoff } },
      select: { id: true },
    });
    if (stale.length === 0) return { expired: 0 };
    await this.prisma.minesSession.updateMany({
      where: { id: { in: stale.map(s => s.id) } },
      data: { status: MinesStatus.BUSTED, settledAt: new Date() },
    });
    return { expired: stale.length };
  }

  async getAdminHistory(opts: { limit?: number; skip?: number; status?: string; username?: string }) {
    const where: any = {};
    if (opts.status && opts.status !== "ALL") where.status = opts.status;
    if (opts.username) where.user = { username: { contains: opts.username, mode: "insensitive" } };
    return this.prisma.minesSession.findMany({
      where,
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 50,
      skip: opts.skip ?? 0,
    });
  }

  async resetStats() {
    await this.prisma.minesSession.deleteMany({});
    return { ok: true };
  }

  async getRecentResults(limit = 20) {
    return this.prisma.minesSession.findMany({
      where: { status: { in: [MinesStatus.CASHED_OUT, MinesStatus.BUSTED] } },
      orderBy: { settledAt: "desc" },
      take: limit,
      include: { user: { select: { username: true } } },
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
