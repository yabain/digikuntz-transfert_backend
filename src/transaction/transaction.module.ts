import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { Transaction, TransactionSchema } from './transaction.schema';
import { TransactionController } from './transaction.controller';
import { EmailService } from 'src/email/email.service';
import { Country, CountrySchema } from 'src/country/country.schema';
import { City, CitySchema } from 'src/city/city.schema';
import { DateService } from 'src/email/date.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { Payin, PayinSchema } from 'src/payin/payin.schema';
import { Payout, PayoutSchema } from 'src/payout/payout.schema';
import { PayinService } from 'src/payin/payin.service';
import { PayoutService } from 'src/payout/payout.service';
import { EmailSchema, Email } from 'src/email/email.schema';
import { SmtpSchema, Smtp } from 'src/email/smtp/smtp.schema';
import { SmtpService } from 'src/email/smtp/smtp.service';
import { TransactionCron } from './transaction.cron';
// import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: 'Transaction', schema: TransactionSchema },
    ]),
    MongooseModule.forFeature([
      { name: City.name, schema: CitySchema },
      { name: Payin.name, schema: PayinSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Country.name, schema: CountrySchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    // WhatsappModule,
  ],
  providers: [
    TransactionService,
    EmailService,
    DateService,
    FlutterwaveService,
    PayinService,
    PayoutService,
    SmtpService,
    TransactionCron,
  ],
  controllers: [TransactionController],
  exports: [TransactionService],
})
export class TransactionModule {}
