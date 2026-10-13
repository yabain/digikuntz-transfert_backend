/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { DateService } from './date.service';
import { User, UserSchema } from 'src/user/user.schema';
import { ConfigModule } from '@nestjs/config';
import { SmtpModule } from './smtp/smtp.module';
import { Email, EmailSchema } from './email.schema';
import { System, SystemSchema } from 'src/system/system.schema';
import { SystemService } from 'src/system/system.service';
import { CryptService } from 'src/dev/crypt.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Email.name, schema: EmailSchema },
      { name: System.name, schema: SystemSchema },
    ]),
    SmtpModule,
  ],
  providers: [EmailService, DateService, SystemService, CryptService],
  controllers: [EmailController],
  exports: [EmailService, DateService],
})
export class EmailModule {}
