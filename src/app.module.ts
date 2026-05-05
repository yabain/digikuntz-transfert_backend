/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './user/user.module';
import { CountryModule } from './country/country.module';
import { CityModule } from './city/city.module';
import { SystemModule } from './system/system.module';
import { RevokedTokenModule } from './revoked-token/revoked-token.module';
import { EmailModule } from './email/email.module';
import { ConfigService } from '@nestjs/config';
import { NotificationModule } from './notification/notification.module';
import { TransactionModule } from './transaction/transaction.module';
import { AlertModule } from './alert/alert.module';
import { ExchangeModule } from './exchange/exchange.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { SubscriptionModule } from './plans/subscription/subscription.module';
import { OptionsModule } from './plans/options/options.module';
import { BalanceModule } from './balance/balance.module';
import { PlansModule } from './plans/plans.module';
import { PayinModule } from './payin/payin.module';
import { PayoutModule } from './payout/payout.module';
import { FlutterwaveModule } from './flutterwave/flutterwave.module';
import { SmtpModule } from './email/smtp/smtp.module';
import { DevModule } from './dev/dev.module';
import { WhatsappModule } from './wa/whatsapp.module';
import { UserSettingsModule } from './userSettings/userSettings.module';
import { ServiceModule } from './service/service.module';
import { AppCacheModule } from './cache/cache.module';
import { FundraisingModule } from './fundraising/fundraising.module';
import { PaymentRequestModule } from './payment-request/payment-request.module';
import { PaymentMethodModule } from './payment-method/payment-method.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const dbUser = configService.get<string>('DB_USER');
        const dbPassword = configService.get<string>('DB_PASSWORD');
        const dbHost = configService.get<string>('DB_HOST');
        const dbName = configService.get<string>('DB_NAME');
        const dbOptions = configService.get<string>('DB_OPTIONS');
    
        if (!dbUser) {
          throw new Error('DB_USER not found in environment variables');
        }
    
        if (!dbPassword) {
          throw new Error('DB_PASSWORD not found in environment variables');
        }
    
        if (!dbHost) {
          throw new Error('DB_HOST not found in environment variables');
        }
    
        if (!dbName) {
          throw new Error('DB_NAME not found in environment variables');
        }
    
        const encodedUser = encodeURIComponent(dbUser);
        const encodedPassword = encodeURIComponent(dbPassword);
    
        const uri = `mongodb+srv://${encodedUser}:${encodedPassword}@${dbHost}/${dbName}${
          dbOptions ? `?${dbOptions}` : ''
        }`;
    
        return {
          uri,
          serverSelectionTimeoutMS: 10000,
          connectTimeoutMS: 10000,
          socketTimeoutMS: 10000,
        };
      },
    }),
    UserModule,
    AuthModule,
    CountryModule,
    CityModule,
    SystemModule,
    RevokedTokenModule,
    EmailModule,
    NotificationModule,
    TransactionModule,
    AlertModule,
    ExchangeModule,
    NewsletterModule,
    SubscriptionModule,
    OptionsModule,
    BalanceModule,
    PlansModule,
    PayinModule,
    PayoutModule,
    FlutterwaveModule,
    SmtpModule,
    WhatsappModule,
    UserSettingsModule,
    ServiceModule,
    AppCacheModule,
    FundraisingModule,
    PaymentRequestModule,
    PaymentMethodModule,
    DevModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
