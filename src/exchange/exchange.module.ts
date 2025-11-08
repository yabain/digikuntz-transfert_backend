import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { Exchange, ExchangeSchema } from './exchange.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { ExchangeService } from './exchange.service';
import { ExchangeController } from './exchange.controller';
import { UserService } from 'src/user/user.service';
import { User, UserSchema } from 'src/user/user.schema';
import { CountryService } from 'src/country/country.service';
import { Country, CountrySchema } from 'src/country/country.schema';
import { AppCacheModule } from '../cache/cache.module';

@Module({
  imports: [
    HttpModule,
    AppCacheModule,
    MongooseModule.forFeature([
      { name: Exchange.name, schema: ExchangeSchema },
    ]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: Country.name, schema: CountrySchema }]),
  ],
  providers: [ExchangeService, UserService, CountryService],
  controllers: [ExchangeController],
})
export class ExchangeModule {}
