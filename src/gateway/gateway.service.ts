import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventService } from 'src/event/event.service';

@WebSocketGateway({
  cors: {
    origin: '*', // Autoriser toutes les origines (à adapter en production)
  },
})
export class GatewayService {
  @WebSocketServer()
  server: Server;

  constructor(private readonly eventService: EventService) {}

  // Écouter les connexions des clients
  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  // Écouter les déconnexions des clients
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // Écouter les événements de mise à jour
  @SubscribeMessage('updateEvent')
  async handleUpdateEvent(
    @MessageBody() eventId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const event = await this.eventService.findEventById(eventId);
    this.server.emit('eventUpdated', event); // Envoyer les nouvelles données à tous les clients
  }
}
