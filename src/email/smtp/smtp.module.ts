import { Module } from '@nestjs/common';
import { SmtpService } from './smtp.service';
import { SmtpController } from './smtp.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Smtp, SmtpSchema } from './smtp.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Smtp.name, schema: SmtpSchema }]),
  ],
  providers: [SmtpService],
  controllers: [SmtpController],
})
export class SmtpModule {}
