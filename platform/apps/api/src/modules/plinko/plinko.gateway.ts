import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "socket.io";

@WebSocketGateway({ cors: { origin: "*" }, namespace: "/plinko" })
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
