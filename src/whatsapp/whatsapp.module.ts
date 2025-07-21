/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappService } from './whatsapp.service';
import { WhatsappQr, WhatsappQrSchema } from './whatsapp-qr.schema';
import { WhatsappController } from './whatsapp.controller';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
import { User, UserSchema } from 'src/user/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhatsappQr.name, schema: WhatsappQrSchema },
    ]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [WhatsappService, EmailService, DateService],
  exports: [WhatsappService],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
