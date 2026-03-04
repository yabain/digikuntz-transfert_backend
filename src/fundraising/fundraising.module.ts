import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BalanceModule } from 'src/balance/balance.module';
import { FlutterwaveModule } from 'src/flutterwave/flutterwave.module';
import { OperationNotificationService } from 'src/notification/operation-notification.service';
import { UserModule } from 'src/user/user.module';
import { WhatsappModule } from 'src/wa/whatsapp.module';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
import { Email, EmailSchema } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { SmtpService } from 'src/email/smtp/smtp.service';
import { User, UserSchema } from 'src/user/user.schema';
import { FundraisingController } from './fundraising.controller';
import { Donation, DonationSchema } from './donation.schema';
import { Fundraising, FundraisingSchema } from './fundraising.schema';
import { FundraisingService } from './fundraising.service';

@Module({
  imports: [
    UserModule,
    BalanceModule,
    forwardRef(() => FlutterwaveModule),
    forwardRef(() => WhatsappModule),
    MongooseModule.forFeature([
      { name: Fundraising.name, schema: FundraisingSchema },
      { name: Donation.name, schema: DonationSchema },
      { name: User.name, schema: UserSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  controllers: [FundraisingController],
  providers: [
    FundraisingService,
    OperationNotificationService,
    EmailService,
    DateService,
    SmtpService,
  ],
  exports: [FundraisingService],
})
export class FundraisingModule {}
