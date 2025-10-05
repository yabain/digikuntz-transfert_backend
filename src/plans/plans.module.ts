import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { UserSchema, User } from 'src/user/user.schema';
import { OptionsSchema, Options } from './options/options.shema';
import { ItemSchema, Item } from './item/item.shema';
import { PlansSchema, Plans } from './plans.schema';
import { UserService } from 'src/user/user.service';
import { DateService } from 'src/email/date.service';
import { EmailService } from 'src/email/email.service';
import { ItemService } from './item/item.service';
import { OptionsService } from './options/options.service';
import { EmailSchema, Email } from 'src/email/email.schema';
import { SmtpService } from 'src/email/smtp/smtp.service';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { HttpModule } from '@nestjs/axios';
import { Payout, PayoutSchema } from 'src/payout/payout.schema';
import { Payin, PayinSchema } from 'src/payin/payin.schema';
import { PayinService } from 'src/payin/payin.service';
import { PayoutService } from 'src/payout/payout.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { BalanceService } from 'src/balance/balance.service';
import { SubscriptionService } from './subscription/subscription.service';
import { Transaction, TransactionSchema } from 'src/transaction/transaction.schema';
import { Balance, BalanceSchema } from 'src/balance/balance.schema';
import { Subscription, SubscriptionSchema } from './subscription/subscription.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Options.name, schema: OptionsSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Plans.name, schema: PlansSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Payin.name, schema: PayinSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Balance.name, schema: BalanceSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    HttpModule,
  ],
  providers: [
    PlansService,
    UserService,
    OptionsService,
    ItemService,
    EmailService,
    DateService,
    SmtpService,
    FlutterwaveService,
    PayinService,
    PayoutService,
    TransactionService,
    BalanceService,
    SubscriptionService,
  ],
  controllers: [PlansController],
})
export class PlansModule {}
