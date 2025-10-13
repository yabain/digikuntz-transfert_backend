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
import { SystemService } from 'src/system/system.service';
import { System, SystemSchema } from 'src/system/system.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhatsappQr.name, schema: WhatsappQrSchema },
      { name: User.name, schema: UserSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
      { name: System.name, schema: SystemSchema },
    ]),
  ],
  providers: [
    WhatsappService,
    EmailService,
    DateService,
    SmtpService,
    SystemService,
  ],
  exports: [WhatsappService],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
