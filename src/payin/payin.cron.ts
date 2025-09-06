/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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

  @Cron(CronExpression.EVERY_MINUTE) // ou EVERY_5_MINUTES
  async handleCron() {
    this.logger.debug('Cron check pending Payin');
    const pendings: any = await this.payinService.findPending(1000);
    console.log('pendings resp: ', pendings);
    for (const p of pendings) {
      try {
        if (this.payinService.isMoreThan15MinutesAhead(p.updatedAt)) {
          await this.fw.verifyAndClosePayin(p.txRef, 'no_id', true);
        } else {
          await this.fw.verifyPayin(p.txRef);
        }
        // const res = await this.payinService.verifyPayin(p.txRef);
      } catch (err) {
        this.logger.warn('Error verifying tx ' + p.txRef + ' : ' + err.message);
      }
    }
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
