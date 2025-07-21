import { Module } from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { FavoriteController } from './favorite.controller';
import { FavoriteSchema } from './favorite.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { EventSchema } from '../event/event.schema';
import { UserSchema } from '../user/user.schema';
import { TicketClassesService } from 'src/ticket-classes/ticket-classes.service';
import { TicketClassesSchema } from 'src/ticket-classes/ticket-classes.shema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'Favorite', schema: FavoriteSchema }]),
    MongooseModule.forFeature([{ name: 'Event', schema: EventSchema }]),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    MongooseModule.forFeature([
      { name: 'TicketClasses', schema: TicketClassesSchema },
    ]),
  ],
  providers: [FavoriteService, TicketClassesService],
  controllers: [FavoriteController],
})
export class FavoriteModule {}
