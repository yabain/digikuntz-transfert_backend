import { Module } from '@nestjs/common';
import { PayinService } from './payin.service';
import { PayinController } from './payin.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Payin, PayinSchema } from './payin.schema';
import { PayinCron } from './payin.cron';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { Payout, PayoutSchema } from 'src/payout/payout.schema';
import { TransactionService } from 'src/transaction/transaction.service';
import {
  Transaction,
  TransactionSchema,
} from 'src/transaction/transaction.schema';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: Payin.name, schema: PayinSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  providers: [PayinService, PayinCron, FlutterwaveService, TransactionService],
  controllers: [PayinController],
  exports: [PayinService],
})
export class PayinModule {}
