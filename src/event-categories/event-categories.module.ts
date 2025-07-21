import { Module } from '@nestjs/common';
import { EventCategoriesService } from './event-categories.service';
import { EventCategoriesController } from './event-categories.controller';
import { AuthModule } from '../auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EventCategories,
  EventCategoriesSchema,
} from './event-categories.schema';
import { EventSchema } from '../event/event.schema';
import { Country, CountrySchema } from '../country/country.schema';
import { City, CitySchema } from '../city/city.schema';
import { TicketClassesService } from 'src/ticket-classes/ticket-classes.service';
import { TicketSchema } from 'src/ticket/ticket.schema';
import { TicketClassesSchema } from 'src/ticket-classes/ticket-classes.shema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: EventCategories.name, schema: EventCategoriesSchema },
    ]),
    MongooseModule.forFeature([{ name: Event.name, schema: EventSchema }]),
    MongooseModule.forFeature([{ name: Country.name, schema: CountrySchema }]),
    MongooseModule.forFeature([{ name: City.name, schema: CitySchema }]),
    MongooseModule.forFeature([{ name: 'Ticket', schema: TicketSchema }]),
    MongooseModule.forFeature([
      { name: 'TicketClasses', schema: TicketClassesSchema },
    ]),
  ],
  providers: [EventCategoriesService, TicketClassesService],
  controllers: [EventCategoriesController],
})
export class EventCategoriesModule {}
