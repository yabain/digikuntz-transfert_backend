import { Module } from '@nestjs/common';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';
import { EventService } from 'src/event/event.service';
import { MongooseModule } from '@nestjs/mongoose';
import { EventSchema } from 'src/event/event.schema';
import { CountrySchema } from 'src/country/country.schema';
import { CitySchema } from 'src/city/city.schema';
import { EventCategoriesSchema } from 'src/event-categories/event-categories.schema';
import { UserService } from 'src/user/user.service';
import { TicketClassesService } from 'src/ticket-classes/ticket-classes.service';
import { TicketService } from 'src/ticket/ticket.service';
import { NotificationService } from 'src/notification/notification.service';
import { UserSchema } from 'src/user/user.schema';
import { FollowService } from 'src/follow/follow.service';
import { TicketClassesSchema } from 'src/ticket-classes/ticket-classes.shema';
import { TicketSchema } from 'src/ticket/ticket.schema';
import { NotificationSchema } from 'src/notification/notification.schema';
import { FollowSchema } from 'src/follow/follow.schema';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
// import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Event', schema: EventSchema }]),
    MongooseModule.forFeature([{ name: 'Country', schema: CountrySchema }]),
    MongooseModule.forFeature([{ name: 'City', schema: CitySchema }]),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    MongooseModule.forFeature([{ name: 'Ticket', schema: TicketSchema }]),
    MongooseModule.forFeature([{ name: 'Follow', schema: FollowSchema }]),
    MongooseModule.forFeature([
      { name: 'Notification', schema: NotificationSchema },
    ]),
    MongooseModule.forFeature([
      { name: 'TicketClasses', schema: TicketClassesSchema },
    ]),
    MongooseModule.forFeature([
      { name: 'EventCategories', schema: EventCategoriesSchema },
    ]),
    // WhatsappModule,
  ],
  controllers: [MetaController],
  providers: [
    MetaService,
    EventService,
    UserService,
    TicketClassesService,
    TicketService,
    NotificationService,
    FollowService,
    EmailService,
    DateService,
  ],
})
export class MetaModule {}
