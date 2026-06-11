import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { UseGuards, Logger } from "@nestjs/common";
import { CoinflipService, CoinSide } from "./coinflip.service";
import { WalletService } from "../wallet/wallet.service";
import { WsJwtGuard } from "../../common/guards/ws-jwt.guard";
import { WS_CORS } from "../../common/ws-cors";

@WebSocketGateway({ cors: WS_CORS })
export class CoinflipGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(CoinflipGateway.name);

  constructor(
    private readonly coinflipService: CoinflipService,
    private readonly walletService: WalletService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Coinflip connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Coinflip disconnected: ${client.id}`);
  }

  private async emitBalance(client: Socket, userId: string) {
    try {
      const wallet = await this.walletService.getSummary(userId);
      client.emit("wallet:balance", { available: Number(wallet.available) });
    } catch { /* non-critical */ }
  }

  private broadcastLive(username: string, result: { status: string; streak: number; multiplier: number; payout: number }, betAmount?: number) {
    this.server.emit("coinflip:live", {
      username,
      status: result.status,
      streak: result.streak,
      multiplier: result.multiplier,
      payout: result.payout,
      betAmount,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("coinflip:start")
  async handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { betAmount: number; side: CoinSide; clientSeed: string },
  ) {
    try {
      const user   = (client as any).user;
      const result = await this.coinflipService.startGame(user.userId, Number(data.betAmount), data.side, data.clientSeed);
      await this.emitBalance(client, user.userId);
      if (result.status !== "IN_PROGRESS") this.broadcastLive(user.username, result, Number(data.betAmount));
      return { event: "coinflip:startResponse", data: { ok: true, result } };
    } catch (e) {
      return { event: "coinflip:error", data: { message: (e as Error).message } };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("coinflip:flip")
  async handleFlip(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; side: CoinSide },
  ) {
    try {
      const user   = (client as any).user;
      const result = await this.coinflipService.flip(user.userId, data.sessionId, data.side);
      if (result.status !== "IN_PROGRESS") {
        await this.emitBalance(client, user.userId);
        this.broadcastLive(user.username, result);
      }
      return { event: "coinflip:flipResponse", data: { ok: true, result } };
    } catch (e) {
      return { event: "coinflip:error", data: { message: (e as Error).message } };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("coinflip:cashout")
  async handleCashout(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    try {
      const user   = (client as any).user;
      const result = await this.coinflipService.cashout(user.userId, data.sessionId);
      await this.emitBalance(client, user.userId);
      this.broadcastLive(user.username, result);
      return { event: "coinflip:cashoutResponse", data: { ok: true, result } };
    } catch (e) {
      this.logger.warn(`coinflip:cashout FAIL user=${(client as any).user?.userId}: ${(e as Error).message}`);
      return { event: "coinflip:error", data: { message: (e as Error).message } };
    }
  }
}
