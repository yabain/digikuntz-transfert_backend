import { Module } from '@nestjs/common';
import { EventService } from '../event/event.service'; // Importer EventService
import { EventsGateway } from './event.gateway';
import { MongooseModule } from '@nestjs/mongoose';
import { CitySchema } from 'src/city/city.schema';
import { CountrySchema } from 'src/country/country.schema';
import { EventCategoriesSchema } from 'src/event-categories/event-categories.schema';
import { EventSchema } from 'src/event/event.schema';
import { TicketClassesSchema } from 'src/ticket-classes/ticket-classes.shema';
import { UserSchema } from 'src/user/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'EventCategories', schema: EventCategoriesSchema },
    ]),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    MongooseModule.forFeature([{ name: 'Country', schema: CountrySchema }]),
    MongooseModule.forFeature([{ name: 'City', schema: CitySchema }]),
    MongooseModule.forFeature([
      { name: 'TicketClasses', schema: TicketClassesSchema },
    ]),
    MongooseModule.forFeature([{ name: 'Event', schema: EventSchema }]),
  ],
  providers: [EventsGateway, EventService], // Fournir EventsGateway et EventService
})
export class GatewayModule {}
