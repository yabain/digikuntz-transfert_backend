// src/transaction/transaction.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Transactions, TransactionsSchema } from './transactions.schema';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsCron } from './transactions.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transactions.name, schema: TransactionsSchema },
    ]),
  ],
  providers: [TransactionsService, TransactionsCron],
  controllers: [TransactionsController],
})
export class TransactionsModule {}
