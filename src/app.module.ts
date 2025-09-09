/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
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
import { SoldeModule } from './solde/solde.module';
import { PlansModule } from './plans/plans.module';
import { PayinModule } from './payin/payin.module';
import { PayoutModule } from './payout/payout.module';
import { FlutterwaveModule } from './flutterwave/flutterwave.module';
import { SmtpModule } from './email/smtp/smtp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DB_URL');
        if (!dbUrl) {
          throw new Error('DB_URL not found in environment variables');
        }

        const credentialsRegex = /^(mongodb\+srv:\/\/)([^:]+):([^@]+)@(.*)$/;
        const match = dbUrl.match(credentialsRegex);

        if (match) {
          const prefix = match[1];
          const username = match[2];
          const password = match[3];
          const suffix = match[4];
          const encodedPassword = encodeURIComponent(password);
          const newUrl = `${prefix}${encodeURIComponent(
            username,
          )}:${encodedPassword}@${suffix}`;
          return {
            uri: newUrl,
          };
        }

        return {
          uri: dbUrl,
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
    SoldeModule,
    PlansModule,
    PayinModule,
    PayoutModule,
    FlutterwaveModule,
    SmtpModule,
    // WhatsappModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
