import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Prospect, ProspectSchema } from './prospect.schema';
import { ProspectsController } from './prospects.controller';
import { ProspectsPublicController } from './prospects-public.controller';
import { ProspectsService } from './prospects.service';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
import { Email, EmailSchema } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { SmtpService } from 'src/email/smtp/smtp.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Prospect.name, schema: ProspectSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  controllers: [ProspectsController, ProspectsPublicController],
  providers: [ProspectsService, EmailService, DateService, SmtpService],
  exports: [ProspectsService],
})
export class ProspectsModule {}
