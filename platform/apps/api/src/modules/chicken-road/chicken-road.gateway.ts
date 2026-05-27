import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { UseGuards, Logger } from "@nestjs/common";
import { ChickenRoadService } from "./chicken-road.service";
import { WalletService } from "../wallet/wallet.service";
import { WsJwtGuard } from "../../common/guards/ws-jwt.guard";
import { WS_CORS } from "../../common/ws-cors";
import { ChickenRoadDifficulty } from "@prisma/client";

@WebSocketGateway({ cors: WS_CORS })
export class ChickenRoadGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChickenRoadGateway.name);

  constructor(
    private readonly chickenRoadService: ChickenRoadService,
    private readonly walletService: WalletService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`ChickenRoad connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`ChickenRoad disconnected: ${client.id}`);
  }

  private async emitBalance(client: Socket, userId: string) {
    try {
      const wallet = await this.walletService.getSummary(userId);
      client.emit("wallet:balance", { available: Number(wallet.available) });
    } catch { /* non-critical */ }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("chickenRoad:start")
  async handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { betAmount: number; difficulty: ChickenRoadDifficulty; clientSeed: string },
  ) {
    try {
      const user    = (client as any).user;
      const session = await this.chickenRoadService.startGame(user.userId, data.betAmount, data.difficulty, data.clientSeed);
      await this.emitBalance(client, user.userId);
      return { event: "chickenRoad:startResponse", data: { ok: true, session } };
    } catch (e) {
      return { event: "chickenRoad:error", data: { message: (e as Error).message } };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("chickenRoad:move")
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    try {
      const user   = (client as any).user;
      const result = await this.chickenRoadService.move(user.userId, data.sessionId);
      if (result.status === "BUSTED" || result.status === "CASHED_OUT") {
        await this.emitBalance(client, user.userId);
      }
      return { event: "chickenRoad:moveResponse", data: { ok: true, result } };
    } catch (e) {
      return { event: "chickenRoad:error", data: { message: (e as Error).message } };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("chickenRoad:cashout")
  async handleCashout(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    try {
      const user   = (client as any).user;
      const result = await this.chickenRoadService.cashout(user.userId, data.sessionId);
      await this.emitBalance(client, user.userId);
      return { event: "chickenRoad:cashoutResponse", data: { ok: true, result } };
    } catch (e) {
      return { event: "chickenRoad:error", data: { message: (e as Error).message } };
    }
  }
}
