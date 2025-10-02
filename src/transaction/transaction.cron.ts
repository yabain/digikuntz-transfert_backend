/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/transactions/transactions.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TransactionService } from './transaction.service';

@Injectable()
export class TransactionCron {
  private readonly logger = new Logger(TransactionCron.name);
  private isRunning = false;

  constructor(private transactionService: TransactionService) {}

  @Cron(CronExpression.EVERY_MINUTE) // ou EVERY_MINUTES
  async handleCron() {
    if (this.isRunning) {
      this.logger.debug('Transaction cron already running, skipping...');
      return;
    }
    
    this.isRunning = true;
    try {
      this.logger.debug('Cron check processing Transaction');
    const resPerPage = {
      resPerPage: 1000,
      page: 1,
    };
    const pending: any =
      await this.transactionService.getPayoutPendingListByStatus(resPerPage);
    console.log('(Transaction Cron) Verify transaction: ', pending);
      for (const t of pending) {
        try {
          await this.transactionService.verifyTransactionPayoutStatus(t);
        } catch (err) {
          this.logger.warn(
            '(Transaction Cron) Error verifying transaction ' + t.reference + ' : ' + err.message,
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
