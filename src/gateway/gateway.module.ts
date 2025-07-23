import { Module } from '@nestjs/common';
import { EventsGateway } from './event.gateway';
import { MongooseModule } from '@nestjs/mongoose';
import { CitySchema } from 'src/city/city.schema';
import { CountrySchema } from 'src/country/country.schema';
import { UserSchema } from 'src/user/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    MongooseModule.forFeature([{ name: 'Country', schema: CountrySchema }]),
    MongooseModule.forFeature([{ name: 'City', schema: CitySchema }]),
  ],
  providers: [EventsGateway], // Fournir EventsGateway et EventService
})
export class GatewayModule {}
