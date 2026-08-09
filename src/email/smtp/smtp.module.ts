import { Module } from '@nestjs/common';
import { SmtpService } from './smtp.service';
import { SmtpController } from './smtp.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Smtp, SmtpSchema } from './smtp.schema';
import { DevModule } from 'src/dev/dev.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Smtp.name, schema: SmtpSchema }]),
    DevModule,
  ],
  providers: [SmtpService],
  controllers: [SmtpController],
  exports: [SmtpService],
})
export class SmtpModule {}
