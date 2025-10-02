import { Module } from '@nestjs/common';
import { PayinService } from './payin.service';
import { PayinController } from './payin.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Payin, PayinSchema } from './payin.schema';
import { PayinCron } from './payin.cron';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { Payout, PayoutSchema } from 'src/payout/payout.schema';
import { TransactionService } from 'src/transaction/transaction.service';
import {
  Transaction,
  TransactionSchema,
} from 'src/transaction/transaction.schema';
import { PayoutService } from 'src/payout/payout.service';
import { BalanceService } from 'src/balance/balance.service';
import { Balance, BalanceSchema } from 'src/balance/balance.schema';
import { UserService } from 'src/user/user.service';
import { User, UserSchema } from 'src/user/user.schema';
import { SubscriptionService } from 'src/plans/subscription/subscription.service';
import {
  Subscription,
  SubscriptionSchema,
} from 'src/plans/subscription/subscription.schema';
import { ItemService } from 'src/plans/item/item.service';
import { OptionsService } from 'src/plans/options/options.service';
import { Item, ItemSchema } from 'src/plans/item/item.shema';
import { Plans, PlansSchema } from 'src/plans/plans.schema';
import { Email, EmailSchema } from 'src/email/email.schema';
import { EmailService } from 'src/email/email.service';
import { Options, OptionsSchema } from 'src/plans/options/options.shema';
import { DateService } from 'src/email/date.service';
import { SmtpService } from 'src/email/smtp/smtp.service';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: Payin.name, schema: PayinSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Balance.name, schema: BalanceSchema },
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Plans.name, schema: PlansSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Options.name, schema: OptionsSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  providers: [
    PayinService,
    PayinCron,
    FlutterwaveService,
    TransactionService,
    PayoutService,
    BalanceService,
    UserService,
    SubscriptionService,
    ItemService,
    OptionsService,
    EmailService,
    DateService,
    SmtpService,
  ],
  controllers: [PayinController],
  exports: [PayinService],
})
export class PayinModule {}
