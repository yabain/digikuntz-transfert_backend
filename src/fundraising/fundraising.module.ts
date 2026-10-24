import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BalanceModule } from 'src/balance/balance.module';
import { FlutterwaveModule } from 'src/flutterwave/flutterwave.module';
import { OperationNotificationService } from 'src/notification/operation-notification.service';
import { UserModule } from 'src/user/user.module';
import { WhatsappModule } from 'src/wa/whatsapp.module';
import { Email, EmailSchema } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { User, UserSchema } from 'src/user/user.schema';
import { FundraisingController } from './fundraising.controller';
import { Donation, DonationSchema } from './donation.schema';
import { Fundraising, FundraisingSchema } from './fundraising.schema';
import { FundraisingService } from './fundraising.service';
import { EmailModule } from 'src/email/email.module';
import { CommissionResolverModule } from 'src/common/services/commission-resolver.module';
import { PaymentMethodModule } from 'src/payment-method/payment-method.module';

@Module({
  imports: [
    EmailModule,
    forwardRef(() => UserModule),
    BalanceModule,
    forwardRef(() => FlutterwaveModule),
    forwardRef(() => WhatsappModule),
    CommissionResolverModule,
    PaymentMethodModule,
    MongooseModule.forFeature([
      { name: Fundraising.name, schema: FundraisingSchema },
      { name: Donation.name, schema: DonationSchema },
      { name: User.name, schema: UserSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  controllers: [FundraisingController],
  providers: [FundraisingService, OperationNotificationService],
  exports: [FundraisingService],
})
export class FundraisingModule {}
