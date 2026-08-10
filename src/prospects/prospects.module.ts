import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Prospect, ProspectSchema } from './prospect.schema';
import { ProspectsController } from './prospects.controller';
import { ProspectsPublicController } from './prospects-public.controller';
import { ProspectsService } from './prospects.service';
import { Email, EmailSchema } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: Prospect.name, schema: ProspectSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  controllers: [ProspectsController, ProspectsPublicController],
  providers: [ProspectsService],
  exports: [ProspectsService],
})
export class ProspectsModule {}
