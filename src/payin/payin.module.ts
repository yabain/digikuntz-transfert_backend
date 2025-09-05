import { Module } from '@nestjs/common';
import { PayinService } from './payin.service';
import { PayinController } from './payin.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Payin, PayinSchema } from './payin.schema';
import { PayinCron } from './payin.cron';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([{ name: Payin.name, schema: PayinSchema }]),
  ],
  providers: [PayinService, PayinCron],
  controllers: [PayinController],
  exports: [PayinService],
})
export class PayinModule {}
