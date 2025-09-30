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
import { BalanceService } from 'src/balance/balance.service';
import { Balance, BalanceSchema } from 'src/balance/balance.schema';
import { UserService } from 'src/user/user.service';
import { User, UserSchema } from 'src/user/user.schema';
import {
  Subscription,
  SubscriptionSchema,
} from 'src/plans/subscription/subscription.schema';
import { SubscriptionService } from 'src/plans/subscription/subscription.service';
import { ItemService } from 'src/plans/item/item.service';
import { OptionsService } from 'src/plans/options/options.service';
import { Item, ItemSchema } from 'src/plans/item/item.shema';
import { Plans, PlansSchema } from 'src/plans/plans.schema';
import { Options, OptionsSchema } from 'src/plans/options/options.shema';
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
      { name: Balance.name, schema: BalanceSchema },
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Plans.name, schema: PlansSchema },
      { name: Options.name, schema: OptionsSchema },
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
    BalanceService,
    UserService,
    SubscriptionService,
    ItemService,
    OptionsService,
  ],
  controllers: [TransactionController],
  exports: [TransactionService],
})
export class TransactionModule {}
