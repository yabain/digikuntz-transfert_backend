import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AheadService } from './ahead.service';
import { AheadController } from './ahead.controller';
import { AuthModule } from '../auth/auth.module';
import { CitySchema } from '../city/city.schema';
import { CountrySchema } from '../country/country.schema';
import { EventSchema } from '../event/event.schema';
import { AheadSchema } from './ahead.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'City', schema: CitySchema }]),
    MongooseModule.forFeature([{ name: 'Country', schema: CountrySchema }]),
    MongooseModule.forFeature([{ name: 'Event', schema: EventSchema }]),
    MongooseModule.forFeature([{ name: 'Ahead', schema: AheadSchema }]),
  ],
  providers: [AheadService],
  controllers: [AheadController],
})
export class AheadModule {}
