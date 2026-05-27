import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "socket.io";
import { WS_CORS } from "../../common/ws-cors";

@WebSocketGateway({ cors: WS_CORS, namespace: "/plinko" })
export class PlinkoGateway {
  @WebSocketServer() server!: Server;

  broadcastBet(data: {
    betId: string;
    username: string;
    betAmount: number;
    rows: number;
    riskLevel: string;
    slot: number;
    multiplier: number;
    payout: number;
  }) {
    this.server.emit("plinko:bet", data);
  }
}
