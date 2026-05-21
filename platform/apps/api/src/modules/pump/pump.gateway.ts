import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({ cors: { origin: "*" }, namespace: "/pump" })
export class PumpGateway {
  @WebSocketServer() server!: Server;

  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  @SubscribeMessage("pump:subscribe")
  subscribe(@ConnectedSocket() c: Socket) {
    return { ok: true };
  }
}
