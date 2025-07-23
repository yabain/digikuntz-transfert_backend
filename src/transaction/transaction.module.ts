import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionSchema } from './transaction.schema';
import { TransactionController } from './transaction.controller';
import { EmailService } from 'src/email/email.service';
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
    MongooseModule.forFeature([{ name: City.name, schema: CitySchema }]),
    MongooseModule.forFeature([{ name: Country.name, schema: CountrySchema }]),
    // WhatsappModule,
  ],
  providers: [TransactionService, EmailService, DateService],
  controllers: [TransactionController],
})
export class TransactionModule {}
