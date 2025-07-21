import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { EventSchema, Event } from '../event/event.schema';
import { TicketClassesSchema } from '../ticket-classes/ticket-classes.shema';
import { User, UserSchema } from '../user/user.schema';
import { EventCategoriesSchema } from '../event-categories/event-categories.schema';
import { Ticket, TicketSchema } from './ticket.schema';
import { TicketClassesService } from 'src/ticket-classes/ticket-classes.service';
import { City, CitySchema } from 'src/city/city.schema';
import { Country, CountrySchema } from 'src/country/country.schema';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
// import { WhatsappService } from 'src/whatsapp/whatsapp.service';
import { WhatsappQr, WhatsappQrSchema } from 'src/whatsapp/whatsapp-qr.schema';
// import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
    MongooseModule.forFeature([{ name: Event.name, schema: EventSchema }]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: Country.name, schema: CountrySchema }]),
    MongooseModule.forFeature([{ name: City.name, schema: CitySchema }]),
    MongooseModule.forFeature([
      { name: 'TicketClasses', schema: TicketClassesSchema },
    ]),
    MongooseModule.forFeature([
      { name: 'EventCategories', schema: EventCategoriesSchema },
    ]),
    MongooseModule.forFeature([
      { name: WhatsappQr.name, schema: WhatsappQrSchema },
    ]),
    // WhatsappModule,
  ],
  providers: [
    TicketService,
    TicketClassesService,
    EmailService,
    DateService,
    // WhatsappService,
  ],
  controllers: [TicketController],
  exports: [TicketService],
})
export class TicketModule {}
