import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { FlutterwaveService } from './flutterwave.service';
import { FlutterwaveController } from './flutterwave.controller';
import { Payin, PayinSchema } from 'src/payin/payin.schema';
import { Payout, PayoutSchema } from 'src/payout/payout.schema';
import { PayinService } from 'src/payin/payin.service';
import { PayoutService } from 'src/payout/payout.service';
import { TransactionService } from 'src/transaction/transaction.service';
import {
  Transaction,
  TransactionSchema,
} from 'src/transaction/transaction.schema';
import { Balance, BalanceSchema } from 'src/balance/balance.schema';
import { BalanceService } from 'src/balance/balance.service';
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
import { EmailService } from 'src/email/email.service';
import { Options, OptionsSchema } from 'src/plans/options/options.shema';
import { Email, EmailSchema } from 'src/email/email.schema';
import { DateService } from 'src/email/date.service';
import { SmtpService } from 'src/email/smtp/smtp.service';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { WhatsappModule } from 'src/wa/whatsapp.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    WhatsappModule,
    MongooseModule.forFeature([
      { name: Payin.name, schema: PayinSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Balance.name, schema: BalanceSchema },
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Plans.name, schema: PlansSchema },
      { name: Options.name, schema: OptionsSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  controllers: [FlutterwaveController],
  providers: [
    FlutterwaveService,
    PayinService,
    PayoutService,
    TransactionService,
    BalanceService,
    UserService,
    SubscriptionService,
    ItemService,
    OptionsService,
    EmailService,
    DateService,
    SmtpService,
  ],
  exports: [FlutterwaveService],
})
export class FlutterwaveModule {}
