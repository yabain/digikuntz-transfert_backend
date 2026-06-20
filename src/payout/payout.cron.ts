/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/transactions/transactions.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayoutService } from './payout.service';

@Injectable()
export class PayoutCron {
  private readonly logger = new Logger(PayoutCron.name);
  private isRunning = false;

  constructor(
    private payoutService: PayoutService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE) // ou EVERY_MINUTES
  async handleCron() {
    if (this.isRunning) {
      this.logger.debug('Payout cron already running, skipping...');
      return;
    }
    
    this.isRunning = true;
    try {
      // this.logger.debug('Cron check processing Payout');
    const processings: any = await this.payoutService.findPending(1000);
    // console.log(`[PayoutCron] ${processings.length} payout(s) en attente de vérification`);
      for (const p of processings) {
        // console.log(`[PayoutCron] → vérification: reference=${p.reference} flwTxId=${p.flwTxId} transactionId=${p.transactionId} updatedAt=${p.updatedAt}`);
        try {
            await this.payoutService.verifyPayout(p.reference, false, p.flwTxId);
        } catch (err) {
          // console.log(`[PayoutCron] ERREUR verifyPayout ${p.reference}: ${err.message}`);
          if(this.payoutService.isMoreThan8HoursAhead(p.updatedAt)){
            this.payoutService.forceFailStuckPayout(p.reference, String(p.transactionId));
          }
          this.logger.warn('(payout cron)Error verifying payout ' + p.reference + ' : ' + err.message);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
