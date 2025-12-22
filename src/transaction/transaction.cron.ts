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
      resPerPage: 500,
      page: 1,
    };
    this.handlePayinPendinding(resPerPage);
    this.handlePayoutPendinding(resPerPage);
    } finally {
      this.isRunning = false;
    }
  }

  async handlePayoutPendinding(resPerPage): Promise<any>{
    const pending: any =
      await this.transactionService.getPayoutPendingListByStatus(resPerPage);
    // console.log('(Transaction Cron) Verify transaction Payout: ', pending);
      for (const t of pending) {
        try {
          await this.transactionService.verifyTransactionPayoutStatus(t);
        } catch (err) {
          this.logger.warn(
            '(Transaction Cron) Error verifying transaction ' + t.reference + ' : ' + err.message,
          );
        }
      }
  }

  async handlePayinPendinding(resPerPage): Promise<any>{
    const pending: any =
      await this.transactionService.getPayinPendingListByStatus(resPerPage);
    // console.log('(Transaction Cron) Verify transaction Payin: ', pending);
      for (const t of pending) {
        try {
          await this.transactionService.verifyTransactionPayinStatus(t);
        } catch (err) {
          this.logger.warn(
            '(Transaction Cron) Error verifying transaction ' + t.reference + ' : ' + err.message,
          );
        }
      }
  }





  // private readonly logger = new Logger(TransactionsCron.name);
  // constructor(private txService: TransactionsService) {}

  // @Cron(CronExpression.EVERY_MINUTE) // ou EVERY_5_MINUTES
  // async handleCron() {
  //   this.logger.debug('Cron check pending transactions');
  //   const pendings = await this.txService.findPending(30);
  //   for (const p of pendings) {
  //     try {
  //       await this.txService.verifyWithFlutterwaveByTxRef(p.txRef);
  //     } catch (err) {
  //       this.logger.warn('Error verifying tx ' + p.txRef + ' : ' + err.message);
  //     }
  //   }
  // }
}
