import { Module } from '@nestjs/common';
import { TicketClassesService } from './ticket-classes.service';
import { MongooseModule } from '@nestjs/mongoose';
import { TicketClassesSchema } from './ticket-classes.shema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'TicketClasses', schema: TicketClassesSchema },
    ]),
  ],
  providers: [TicketClassesService],
})
export class TicketClassesModule {}
