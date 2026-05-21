import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  ConnectedSocket, OnGatewayConnection,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class PumpGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    client.join("pump");
  }

  broadcast(event: string, payload: any) {
    this.server.to("pump").emit(event, payload);
  }

  @SubscribeMessage("pump:subscribe")
  subscribe(@ConnectedSocket() c: Socket) {
    c.join("pump");
    return { ok: true };
  }
}
