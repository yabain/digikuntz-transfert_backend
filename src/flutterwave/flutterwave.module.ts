import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { FlutterwaveService } from './flutterwave.service';
import { FlutterwaveController } from './flutterwave.controller';
import { Payin, PayinSchema } from 'src/payin/payin.schema';
import { Payout, PayoutSchema } from 'src/payout/payout.schema';
import { PayinService } from 'src/payin/payin.service';
import { PayoutService } from 'src/payout/payout.service';
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
  controllers: [FlutterwaveController],
  providers: [
    FlutterwaveService,
    PayinService,
    PayoutService,
    TransactionService,
  ],
  exports: [FlutterwaveService],
})
export class FlutterwaveModule {}
