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
  lastExecutionDate: Date = new Date();
  constructor(
    private payinService: PayinService,
    private fw: FlutterwaveService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS) // ou EVERY_30_SECONDS
  async handleCron() {
    if (!this.isMoreThan10sec(this.lastExecutionDate)) {
      this.logger.debug('(Payin cron) Can not execut cron now');
    }
    this.logger.debug('(Payin cron) check pending Payin');
    const pendings: any = await this.payinService.findPending(100);
    console.log('pendings resp (Payin cron) : ', pendings);
    for (const p of pendings) {
      try {
        if (this.payinService.isMoreThan60MinutesAhead(p.createdAt)) {
          await this.fw.verifyAndClosePayin(p.txRef, 'no_id', true);
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
    this.lastExecutionDate = new Date();
  }

  isMoreThan10sec(inputDate: string | Date): boolean {
    const target = new Date(inputDate).getTime();
    const now = Date.now();
    const diff = now - target;
    return diff > 10 * 1000; // true si plus de 15 min d'avance
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
