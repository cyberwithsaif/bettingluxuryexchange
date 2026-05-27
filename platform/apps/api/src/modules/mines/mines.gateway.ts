import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { MinesService } from "./mines.service";
import { WalletService } from "../wallet/wallet.service";
import { UseGuards, Logger } from "@nestjs/common";
import { WsJwtGuard } from "../../common/guards/ws-jwt.guard";
import { WS_CORS } from "../../common/ws-cors";

@WebSocketGateway({ cors: WS_CORS })
export class MinesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MinesGateway.name);

  constructor(
    private readonly minesService: MinesService,
    private readonly walletService: WalletService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to Mines: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from Mines: ${client.id}`);
  }

  private async emitBalance(client: Socket, userId: string) {
    try {
      const wallet = await this.walletService.getSummary(userId);
      client.emit("wallet:balance", { available: Number(wallet.available) });
    } catch { /* non-critical */ }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("mines:start")
  async handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { betAmount: number; minesCount: number; clientSeed: string }
  ) {
    try {
      const user = (client as any).user;
      const session = await this.minesService.startGame(user.userId, data.betAmount, data.minesCount, data.clientSeed);
      await this.emitBalance(client, user.userId);
      return { event: "mines:startResponse", data: { ok: true, session } };
    } catch (e) {
      return { event: "mines:error", data: { message: (e as Error).message } };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("mines:click")
  async handleClick(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; tileIndex: number }
  ) {
    try {
      const user = (client as any).user;
      const result = await this.minesService.clickTile(user.userId, data.sessionId, data.tileIndex);
      if (result.status === "BUSTED" || result.status === "CASHED_OUT") {
        await this.emitBalance(client, user.userId);
      }
      return { event: "mines:clickResponse", data: { ok: true, result } };
    } catch (e) {
      return { event: "mines:error", data: { message: (e as Error).message } };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("mines:cashout")
  async handleCashout(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string }
  ) {
    try {
      const user = (client as any).user;
      const result = await this.minesService.cashout(user.userId, data.sessionId);
      await this.emitBalance(client, user.userId);
      return { event: "mines:cashoutResponse", data: { ok: true, result } };
    } catch (e) {
      return { event: "mines:error", data: { message: (e as Error).message } };
    }
  }

  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }
}
