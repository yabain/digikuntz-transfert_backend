/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { User, UserSchema } from 'src/user/user.schema';
import { Email, EmailSchema } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { SystemService } from 'src/system/system.service';
import { System, SystemSchema } from 'src/system/system.schema';
import { CryptService } from 'src/dev/crypt.service';
import { UserModule } from 'src/user/user.module';
import { PlansService } from 'src/plans/plans.service';
import { Plans, PlansSchema } from 'src/plans/plans.schema';
import { PlansModule } from 'src/plans/plans.module';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    EmailModule,
    HttpModule,
    forwardRef(() => UserModule),
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
    SystemService,
    CryptService,
    // PlansService,
  ],
  exports: [WhatsappService],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
