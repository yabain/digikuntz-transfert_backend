/* eslint-disable @typescript-eslint/require-await */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from './user/user.module';
import { EventModule } from './event/event.module';
import { CountryModule } from './country/country.module';
import { CityModule } from './city/city.module';
import { SystemModule } from './system/system.module';
import { EventCategoriesModule } from './event-categories/event-categories.module';
import { TicketClassesModule } from './ticket-classes/ticket-classes.module';
import { FavoriteModule } from './favorite/favorite.module';
import { FollowModule } from './follow/follow.module';
import { TicketModule } from './ticket/ticket.module';
import { AheadModule } from './ahead/ahead.module';
import { RevokedTokenModule } from './revoked-token/revoked-token.module';
import { EmailModule } from './email/email.module';
import { ConfigService } from '@nestjs/config';
import { NotificationModule } from './notification/notification.module';
import { MetaModule } from './meta/meta.module';
import { TransactionModule } from './transaction/transaction.module';
import { AlertModule } from './alert/alert.module';
// import { WhatsappModule } from './whatsapp/whatsapp.module';

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
    EventModule,
    CountryModule,
    CityModule,
    SystemModule,
    EventCategoriesModule,
    TicketClassesModule,
    FavoriteModule,
    FollowModule,
    TicketModule,
    AheadModule,
    RevokedTokenModule,
    EmailModule,
    NotificationModule,
    MetaModule,
    TransactionModule,
    AlertModule,
    // WhatsappModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
