import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationSchema } from './notification.schema';
import { UserSchema } from '../user/user.schema';
import { EventSchema } from '../event/event.schema';
import { AuthModule } from '../auth/auth.module';
import { FollowSchema } from '../follow/follow.schema';
import { TransactionSchema } from '../transaction/transaction.schema';
import { TicketSchema } from '../ticket/ticket.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    MongooseModule.forFeature([{ name: 'Event', schema: EventSchema }]),
    MongooseModule.forFeature([{ name: 'Follow', schema: FollowSchema }]),
    MongooseModule.forFeature([{ name: 'Ticket', schema: TicketSchema }]),
    MongooseModule.forFeature([
      { name: 'Transaction', schema: TransactionSchema },
    ]),
    MongooseModule.forFeature([
      { name: 'Notification', schema: NotificationSchema },
    ]),
  ],
  providers: [NotificationService],
  controllers: [NotificationController],
})
export class NotificationModule {}
