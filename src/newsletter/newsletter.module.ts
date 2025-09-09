import { Module } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsletterSchema } from './newsletter.schema';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
import { EmailSchema, Email } from 'src/email/email.schema';
import { SmtpService } from 'src/email/smtp/smtp.service';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'Newsletter', schema: NewsletterSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  providers: [NewsletterService, EmailService, DateService, SmtpService],
  controllers: [NewsletterController],
})
export class NewsletterModule {}
