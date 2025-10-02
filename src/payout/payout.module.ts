import { Module } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutController } from './payout.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Payin, PayinSchema } from 'src/payin/payin.schema';
import {
  Transaction,
  TransactionSchema,
} from 'src/transaction/transaction.schema';
import { Payout, PayoutSchema } from './payout.schema';
import { TransactionService } from 'src/transaction/transaction.service';
import { PayoutCron } from './payout.cron';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: Payin.name, schema: PayinSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  providers: [PayoutService, TransactionService, PayoutCron],
  controllers: [PayoutController],
  exports: [PayoutService],
})
export class PayoutModule {}
