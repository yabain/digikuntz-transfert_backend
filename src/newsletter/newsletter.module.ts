import { Module } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsletterSchema } from './newsletter.schema';
import { EmailSchema, Email } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { SystemModule } from 'src/system/system.module';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    EmailModule,
    AuthModule,
    SystemModule,
    MongooseModule.forFeature([
      { name: 'Newsletter', schema: NewsletterSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  providers: [NewsletterService],
  controllers: [NewsletterController],
  exports: [NewsletterService],
})
export class NewsletterModule {}
