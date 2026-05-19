import { Injectable } from "@nestjs/common";
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

/**
 * Roulette realtime gateway.
 * All clients join the "roulette" room on connect to receive round events.
 *
 * Events sent to clients:
 *   roulette:newRound   → new round started, betting open
 *   roulette:betPlaced  → someone placed a bet
 *   roulette:spin       → betting closed, wheel spinning
 *   roulette:result     → winning number announced + settled payouts
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RouletteGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    client.join("roulette");
  }

  @SubscribeMessage("roulette:subscribe")
  subscribe(@ConnectedSocket() c: Socket) {
    c.join("roulette");
    return { ok: true };
  }

  broadcast(event: string, payload: any) {
    this.server.to("roulette").emit(event, payload);
  }
}
