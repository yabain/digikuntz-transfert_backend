import { Module } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsletterSchema } from './newsletter.schema';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'Newsletter', schema: NewsletterSchema },
    ]),
  ],
  providers: [NewsletterService, EmailService, DateService],
  controllers: [NewsletterController],
})
export class NewsletterModule {}
