/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TransactionService } from './transaction.service';
import { TStatus } from './transaction.schema';
import { DistributedLockService } from 'src/distributed-lock/distributed-lock.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';

@Injectable()
export class TransactionCron {
  private readonly logger = new Logger(TransactionCron.name);

  constructor(
    private transactionService: TransactionService,
    private readonly lockService: DistributedLockService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    await this.lockService.withLock('cron:transaction:verify', 120_000, async () => {
      this.logger.debug('Cron check processing Transaction');
      const resPerPage = { resPerPage: 500, page: 1 };
      const payinCount = await this.handlePayinPendinding(resPerPage);
      const payoutCount = await this.handlePayoutPendinding(resPerPage);
      const initCount = await this.handleInitializedPendinding(resPerPage);

      void this.auditLogService.record({
        action: 'cron.transaction_verify.completed',
        resourceType: 'cron',
        metadata: { payinProcessed: payinCount, payoutProcessed: payoutCount, initializedClosed: initCount },
      });
    });
  }

  async handlePayoutPendinding(resPerPage): Promise<number>{
    const pending: any =
      await this.transactionService.getPayoutPendingListByStatus(resPerPage);
    let processed = 0;
      for (const t of pending) {
        try {
          await this.transactionService.verifyTransactionPayoutStatus(t);
          processed++;
        } catch (err) {
          this.logger.warn(
            '(Transaction Cron) Error verifying transaction ' + t.reference + ' : ' + err.message,
          );
        }
      }
      return processed;
  }

  async handleInitializedPendinding(resPerPage): Promise<number> {
    const pending: any =
      await this.transactionService.getInitializedPendingList(resPerPage);
    let processed = 0;
    for (const t of pending) {
      try {
        await this.transactionService.updateTransactionStatus(t._id, TStatus.ERROR);
        processed++;
      } catch (err) {
        this.logger.warn(
          '(Transaction Cron) Error closing initialized transaction ' + t.txRef + ' : ' + err.message,
        );
      }
    }
    return processed;
  }

  async handlePayinPendinding(resPerPage): Promise<number>{
    const pending: any =
      await this.transactionService.getPayinPendingListByStatus(resPerPage);
    let processed = 0;
      for (const t of pending) {
        try {
          await this.transactionService.verifyTransactionPayinStatus(t);
          processed++;
        } catch (err) {
          this.logger.warn(
            '(Transaction Cron) Error verifying transaction ' + t.reference + ' : ' + err.message,
          );
        }
      }
      return processed;
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
