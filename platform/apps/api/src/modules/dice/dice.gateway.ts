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
import { DiceService } from "./dice.service";
import { WalletService } from "../wallet/wallet.service";
import { UseGuards, Logger } from "@nestjs/common";
import { WsJwtGuard } from "../../common/guards/ws-jwt.guard";
import { WS_CORS } from "../../common/ws-cors";
import { DiceMode } from "@prisma/client";

@WebSocketGateway({ cors: WS_CORS })
export class DiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DiceGateway.name);

  constructor(
    private readonly diceService: DiceService,
    private readonly walletService: WalletService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Dice client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Dice client disconnected: ${client.id}`);
  }

  private async emitBalance(client: Socket, userId: string) {
    try {
      const wallet = await this.walletService.getSummary(userId);
      client.emit("wallet:balance", { available: Number(wallet.available) });
    } catch { /* non-critical */ }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("dice:bet")
  async handleBet(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      betAmount: number;
      mode: DiceMode;
      target: number;
      minTarget: number;
      maxTarget: number;
      clientSeed: string;
      nonce: number;
    },
  ) {
    try {
      const user   = (client as any).user;
      const result = await this.diceService.placeBet(
        user.userId,
        Number(data.betAmount),
        data.mode,
        Number(data.target   ?? 50),
        Number(data.minTarget ?? 25),
        Number(data.maxTarget ?? 75),
        data.clientSeed,
        Number(data.nonce ?? 1),
      );

      await this.emitBalance(client, user.userId);

      // Broadcast to live feed (all clients)
      this.server.emit("dice:live", {
        username:   user.username,
        roll:       result.roll,
        won:        result.won,
        multiplier: result.multiplier,
        betAmount:  result.betAmount,
        payout:     result.payout,
        mode:       result.mode,
      });

      return { event: "dice:betResponse", data: { ok: true, result } };
    } catch (e) {
      return { event: "dice:error", data: { message: (e as Error).message } };
    }
  }
}
