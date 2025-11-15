import { Module } from '@nestjs/common';
import { ServiceService } from './service.service';
import { ServiceController } from './service.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { UserSchema, User } from 'src/user/user.schema';
import { OptionsServiceSchema, OptionsService } from './options-service/options-service.shema';
import { ServiceSchema, Service } from './service.schema';
import { UserService } from 'src/user/user.service';
import { DateService } from 'src/email/date.service';
import { EmailService } from 'src/email/email.service';
import { OptionsServiceService } from './options-service/options-service.service';
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
import { Balance, BalanceSchema } from 'src/balance/balance.schema';
import {
  Transaction,
  TransactionSchema,
} from 'src/transaction/transaction.schema';
import { WhatsappModule } from 'src/wa/whatsapp.module';
import { AuthService } from 'src/auth/auth.service';
import {
  RevokedToken,
  RevokedTokenSchema,
} from 'src/revoked-token/revoked-token.schema';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ServicePaymentService } from './service-payment/service-payment.service';
import { ServicePayment, ServicePaymentSchema } from './service-payment/service-payment.schema';
import { SubscriptionService } from 'src/plans/subscription/subscription.service';
import { Subscription, SubscriptionSchema } from 'src/plans/subscription/subscription.schema';
import { ItemService } from 'src/plans/item/item.service';
import { Item, ItemSchema } from 'src/plans/item/item.shema';
import { OptionsService as PlansOptionsService } from 'src/plans/options/options.service';
import { Options, OptionsSchema } from 'src/plans/options/options.shema';
import { Plans, PlansSchema } from 'src/plans/plans.schema';
import { AppCacheModule } from '../cache/cache.module';
import { ServicePaymentController } from './service-payment/service-payment.controller';

@Module({
  imports: [
    AuthModule,
    WhatsappModule,
    AppCacheModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES'),
        },
        ignoreExpiration: false,
      }),
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: OptionsService.name, schema: OptionsServiceSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Payin.name, schema: PayinSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Balance.name, schema: BalanceSchema },
      { name: RevokedToken.name, schema: RevokedTokenSchema },
      { name: ServicePayment.name, schema: ServicePaymentSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Options.name, schema: OptionsSchema },
      { name: Plans.name, schema: PlansSchema },
    ]),
    HttpModule,
  ],
  providers: [
    ServiceService,
    UserService,
    OptionsServiceService,
    EmailService,
    DateService,
    SmtpService,
    FlutterwaveService,
    PayinService,
    PayoutService,
    TransactionService,
    BalanceService,
    AuthService,
    ServicePaymentService,
    SubscriptionService,
    ItemService,
    PlansOptionsService,
  ],
  controllers: [ServiceController, ServicePaymentController],
})
export class ServiceModule {}
