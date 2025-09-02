import { Module } from '@nestjs/common';
import { PayinService } from './payin.service';
import { PayinController } from './payin.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Payin, PayinSchema } from './payin.schema';
import { PayinCron } from './payin.cron';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payin.name, schema: PayinSchema }]),
  ],
  providers: [PayinService, PayinCron],
  controllers: [PayinController],
})
export class PayinModule {}
