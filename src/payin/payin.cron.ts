/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/transactions/transactions.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayinService } from './payin.service';

@Injectable()
export class PayinCron {
  private readonly logger = new Logger(PayinCron.name);
  constructor(private txService: PayinService) {}

  @Cron(CronExpression.EVERY_MINUTE) // ou EVERY_5_MINUTES
  async handleCron() {
    this.logger.debug('Cron check pending Payin');
    const pendings = await this.txService.findPending(30);
    for (const p of pendings) {
      try {
        console.log('Cron payin');
        await this.txService.verifyWithFlutterwaveByTxRef(p.txRef);
      } catch (err) {
        this.logger.warn('Error verifying tx ' + p.txRef + ' : ' + err.message);
      }
    }
  }
}
