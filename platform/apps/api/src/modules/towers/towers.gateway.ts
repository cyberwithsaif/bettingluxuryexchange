import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { UseGuards, Logger } from "@nestjs/common";
import { TowersService } from "./towers.service";
import { WalletService } from "../wallet/wallet.service";
import { WsJwtGuard } from "../../common/guards/ws-jwt.guard";
import { TowersDifficulty } from "@prisma/client";

@WebSocketGateway({ cors: { origin: "*" } })
export class TowersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(TowersGateway.name);

  constructor(
    private readonly towersService: TowersService,
    private readonly walletService: WalletService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Towers connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Towers disconnected: ${client.id}`);
  }

  private async emitBalance(client: Socket, userId: string) {
    try {
      const wallet = await this.walletService.getSummary(userId);
      client.emit("wallet:balance", { available: Number(wallet.available) });
    } catch { /* non-critical */ }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("towers:start")
  async handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { betAmount: number; difficulty: TowersDifficulty; clientSeed: string },
  ) {
    try {
      const user    = (client as any).user;
      const session = await this.towersService.startGame(user.userId, data.betAmount, data.difficulty, data.clientSeed);
      await this.emitBalance(client, user.userId);
      return { event: "towers:startResponse", data: { ok: true, session } };
    } catch (e) {
      return { event: "towers:error", data: { message: (e as Error).message } };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("towers:pick")
  async handlePick(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; col: number },
  ) {
    try {
      const user   = (client as any).user;
      const result = await this.towersService.pickTile(user.userId, data.sessionId, data.col);
      if (result.status === "BUSTED" || result.status === "CASHED_OUT") {
        await this.emitBalance(client, user.userId);
      }
      return { event: "towers:pickResponse", data: { ok: true, result } };
    } catch (e) {
      return { event: "towers:error", data: { message: (e as Error).message } };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("towers:cashout")
  async handleCashout(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    try {
      const user   = (client as any).user;
      const result = await this.towersService.cashout(user.userId, data.sessionId);
      await this.emitBalance(client, user.userId);
      return { event: "towers:cashoutResponse", data: { ok: true, result } };
    } catch (e) {
      return { event: "towers:error", data: { message: (e as Error).message } };
    }
  }
}
