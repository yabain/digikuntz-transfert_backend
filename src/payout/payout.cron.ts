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
  constructor(
    private payoutService: PayoutService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE) // ou EVERY_MINUTES
  async handleCron() {
    this.logger.debug('Cron check processing Payout');
    const processings: any = await this.payoutService.findPending(1000);
    console.log('processings resp: ', processings);
    for (const p of processings) {
      try {
          await this.payoutService.verifyPayout(p.reference);
      } catch (err) {
        this.logger.warn('Error verifying payout ' + p.reference + ' : ' + err.message);
      }
    }
  }
}
