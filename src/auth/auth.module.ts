import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthCron } from './auth.cron';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/user/user.schema';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { HttpModule } from '@nestjs/axios';
import {
  RevokedToken,
  RevokedTokenSchema,
} from '../revoked-token/revoked-token.schema';
// import { WhatsappService } from 'src/whatsapp/whatsapp.service';
// import { WhatsappQr, WhatsappQrSchema } from 'src/whatsapp/whatsapp-qr.schema';
import { Email, EmailSchema } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { SystemService } from 'src/system/system.service';
import { System, SystemSchema } from 'src/system/system.schema';
import { CryptService } from 'src/dev/crypt.service';
import { WhatsappModule } from 'src/wa/whatsapp.module';
import { ProspectsModule } from 'src/prospects/prospects.module';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    EmailModule,
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
      { name: User.name, schema: UserSchema },
      { name: Email.name, schema: EmailSchema },
      // { name: WhatsappQr.name, schema: WhatsappQrSchema },
      { name: RevokedToken.name, schema: RevokedTokenSchema },
      { name: Smtp.name, schema: SmtpSchema },
      { name: System.name, schema: SystemSchema },
    ]),
    forwardRef(() => WhatsappModule),
    ProspectsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthCron, JwtStrategy, SystemService, CryptService],
  exports: [JwtStrategy, PassportModule, AuthService],
})
export class AuthModule {}
