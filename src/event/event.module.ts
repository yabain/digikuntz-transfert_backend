import { Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { EventSchema } from './event.schema';
import { UserSchema } from '../user/user.schema';
import { CountrySchema } from '../country/country.schema';
import { CitySchema } from '../city/city.schema';
import { TicketClassesSchema } from '../ticket-classes/ticket-classes.shema';
import { TicketClassesService } from '../ticket-classes/ticket-classes.service';
import { EventCategoriesSchema } from '../event-categories/event-categories.schema';
import { TicketService } from '../ticket/ticket.service';
import { TicketSchema } from '../ticket/ticket.schema';
import { Follow, FollowSchema } from '../follow/follow.schema';
import { UserService } from '../user/user.service';
import { FollowService } from '../follow/follow.service';
import { NotificationSchema } from '../notification/notification.schema';
import { NotificationService } from '../notification/notification.service';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
// import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'EventCategories', schema: EventCategoriesSchema },
    ]),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    MongooseModule.forFeature([{ name: 'Country', schema: CountrySchema }]),
    MongooseModule.forFeature([{ name: 'City', schema: CitySchema }]),
    MongooseModule.forFeature([{ name: 'Ticket', schema: TicketSchema }]),
    MongooseModule.forFeature([
      { name: 'Notification', schema: NotificationSchema },
    ]),
    MongooseModule.forFeature([
      { name: 'TicketClasses', schema: TicketClassesSchema },
    ]),
    MongooseModule.forFeature([{ name: 'Event', schema: EventSchema }]),
    MongooseModule.forFeature([{ name: Follow.name, schema: FollowSchema }]),
    // WhatsappModule,
  ],
  controllers: [EventController],
  providers: [
    EventService,
    TicketClassesService,
    TicketService,
    UserService,
    FollowService,
    NotificationService,
    EmailService,
    DateService,
  ],
  exports: [EventService],
})
export class EventModule {}
