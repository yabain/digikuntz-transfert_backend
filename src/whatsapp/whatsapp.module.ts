/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappService } from './whatsapp.service';
import { WhatsappQr, WhatsappQrSchema } from './whatsapp-qr.schema';
import { WhatsappController } from './whatsapp.controller';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
import { User, UserSchema } from 'src/user/user.schema';
import { Email, EmailSchema } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { SmtpService } from 'src/email/smtp/smtp.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhatsappQr.name, schema: WhatsappQrSchema },
      { name: User.name, schema: UserSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  providers: [WhatsappService, EmailService, DateService, SmtpService],
  exports: [WhatsappService],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
