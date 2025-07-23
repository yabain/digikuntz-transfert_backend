import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*', // Autoriser toutes les origines (à adapter en production)
  },
})
export class GatewayService {
  @WebSocketServer()
  server: Server;

  constructor() {}

  // Écouter les connexions des clients
  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  // Écouter les déconnexions des clients
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }
}
