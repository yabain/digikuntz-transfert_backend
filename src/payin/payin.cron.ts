/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/transactions/transactions.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayinService } from './payin.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';

@Injectable()
export class PayinCron {
  private readonly logger = new Logger(PayinCron.name);
  constructor(
    private payinService: PayinService,
    private fw: FlutterwaveService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS) // ou EVERY_30_SECONDS
  async handleCron() {
    this.logger.debug('(Payin cron) check pending Payin');
    const pendings: any = await this.payinService.findPending(100);
    console.log('(Payin cron) pendings resp : ', pendings);
    for (const p of pendings) {
      try {
        if (this.isMoreThan60MinutesAhead(p.createdAt)) {
          console.log('(Payin cron) verifying after 60mn txRef: ', p.txRef);
          await this.fw.verifyAndClosePayin(p.txRef);
        } else {
          console.log('(Payin cron) Direct verifying txRef: ', p.txRef);
          await this.fw.verifyPayin(p.txRef);
        }
        // const res = await this.payinService.verifyPayin(p.txRef);
      } catch (err) {
        this.logger.warn('Error verifying tx ' + p.txRef + ' : ' + err.message);
      }
    }
  }

  isMoreThan60MinutesAhead(inputDate: string | Date): boolean {
    const target = new Date(inputDate).getTime();
    const now = Date.now();
    const diff = now - target;

    console.log(
      '[DEBUG isMoreThan60MinutesAhead]',
      'input:',
      inputDate,
      'parsed:',
      new Date(inputDate).toISOString(),
      'now:',
      new Date(now).toISOString(),
      'diff (minutes):',
      diff / 60000,
    );

    return diff > 60 * 60 * 1000;
  }

  // @Cron(CronExpression.EVERY_10_MINUTES)
  // async reconcilePending() {
  //   // Verify pending Payins
  //   const pendingIn = await this.payinModel
  //     .find({ status: 'PENDING' })
  //     .limit(50);
  //   for (const pin of pendingIn) {
  //     try {
  //       await this.verifyPayin(pin.txRef);
  //     } catch (e) {}
  //   }
  // }
}
