/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from 'src/user/user.schema';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { HttpModule } from '@nestjs/axios';
import { RevokedTokenSchema } from '../revoked-token/revoked-token.schema';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
// import { WhatsappService } from 'src/whatsapp/whatsapp.service';
import { WhatsappQr, WhatsappQrSchema } from 'src/whatsapp/whatsapp-qr.schema';
import { Mail, MailSchema } from 'src/email/mail.schema';

@Module({
  imports: [
    HttpModule,
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
      { name: 'User', schema: UserSchema },
      { name: Mail.name, schema: MailSchema },
      { name: WhatsappQr.name, schema: WhatsappQrSchema },
      { name: 'RevokedToken', schema: RevokedTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    EmailService,
    DateService,
    // WhatsappService,
  ],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
