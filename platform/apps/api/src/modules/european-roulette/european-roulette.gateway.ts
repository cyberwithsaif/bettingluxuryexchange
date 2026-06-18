import { Injectable } from "@nestjs/common";
import { OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer, ConnectedSocket } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@Injectable()
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class EuropeanRouletteGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) { client.join("european-roulette"); }

  @SubscribeMessage("european-roulette:subscribe")
  subscribe(@ConnectedSocket() c: Socket) { c.join("european-roulette"); return { ok: true }; }

  broadcast(event: string, payload: any) {
    this.server.to("european-roulette").emit(event, payload);
  }
}
