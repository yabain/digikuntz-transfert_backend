/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { DateService } from './date.service';
import { User, UserSchema } from 'src/user/user.schema';
import { ConfigModule } from '@nestjs/config';
import { SmtpService } from './smtp/smtp.service';
import { Smtp, SmtpSchema } from './smtp/smtp.schema';
import { Email, EmailSchema } from './email.schema';
import { System, SystemSchema } from 'src/system/system.schema';
import { SystemService } from 'src/system/system.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
      { name: System.name, schema: SystemSchema },
    ]),
  ],
  providers: [EmailService, DateService, SmtpService, SystemService],
  controllers: [EmailController],
  exports: [EmailService, DateService, SmtpService],
})
export class EmailModule {}
