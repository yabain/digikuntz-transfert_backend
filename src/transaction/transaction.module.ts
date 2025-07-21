import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionSchema } from './transaction.schema';
import { TransactionController } from './transaction.controller';
import { TicketService } from '../ticket/ticket.service';
import { TicketModule } from 'src/ticket/ticket.module';
import { Ticket, TicketSchema } from 'src/ticket/ticket.schema';
import { EmailService } from 'src/email/email.service';
import {
  TicketClasses,
  TicketClassesSchema,
} from 'src/ticket-classes/ticket-classes.shema';
import { Event, EventSchema } from 'src/event/event.schema';
import { Country, CountrySchema } from 'src/country/country.schema';
import { City, CitySchema } from 'src/city/city.schema';
import { DateService } from 'src/email/date.service';
// import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: 'Transaction', schema: TransactionSchema },
    ]),
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
    MongooseModule.forFeature([{ name: Event.name, schema: EventSchema }]),
    MongooseModule.forFeature([{ name: City.name, schema: CitySchema }]),
    MongooseModule.forFeature([{ name: Country.name, schema: CountrySchema }]),
    MongooseModule.forFeature([
      { name: TicketClasses.name, schema: TicketClassesSchema },
    ]),
    TicketModule,
    // WhatsappModule,
  ],
  providers: [TransactionService, TicketService, EmailService, DateService],
  controllers: [TransactionController],
})
export class TransactionModule {}
