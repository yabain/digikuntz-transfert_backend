import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { DateService } from './date.service';
// import { WhatsappService } from 'src/whatsapp/whatsapp.service';
import { WhatsappQr, WhatsappQrSchema } from 'src/whatsapp/whatsapp-qr.schema';
import { User, UserSchema } from 'src/user/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhatsappQr.name, schema: WhatsappQrSchema },
    ]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [EmailService, DateService],
  controllers: [EmailController],
})
export class EmailModule {}
