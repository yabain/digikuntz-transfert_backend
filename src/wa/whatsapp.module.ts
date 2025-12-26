/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
import { User, UserSchema } from 'src/user/user.schema';
import { Email, EmailSchema } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { SmtpService } from 'src/email/smtp/smtp.service';
import { SystemService } from 'src/system/system.service';
import { System, SystemSchema } from 'src/system/system.schema';
import { UserModule } from 'src/user/user.module';
import { PlansService } from 'src/plans/plans.service';
import { Plans, PlansSchema } from 'src/plans/plans.schema';
import { PlansModule } from 'src/plans/plans.module';

@Module({
  imports: [
    UserModule,
    forwardRef(() => PlansModule),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
      { name: System.name, schema: SystemSchema },
      { name: Plans.name, schema: PlansSchema },
    ]),
  ],
  providers: [
    WhatsappService,
    EmailService,
    DateService,
    SmtpService,
    SystemService,
    // PlansService,
  ],
  exports: [WhatsappService],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
