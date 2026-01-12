/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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

  @Cron(CronExpression.EVERY_10_SECONDS) // ou EVERY_30_SECONDS
  async handleCron() {
    // this.logger.debug('(Payin cron) check pending Payin');
    const pendings: any = await this.payinService.findPending(100);
    console.log('(Payin cron) pendings resp : ', pendings);
    for (const p of pendings) {
      try {
        if (this.payinService.hasExpiredInMinutes(p.createdAt, 480)) {
          console.log('(Payin cron) verifying after 480 minutes txRef: ', p.txRef);
          await this.fw.verifyAndClosePayin(p.txRef);
        } else {
          console.log('(Payin cron) Direct verifying txRef: ', p.txRef);
          await this.fw.verifyPayin(p.txRef);
        }
      } catch (err) {
        this.logger.warn('Error verifying tx ' + p.txRef + ' : ' + err.message);
      }
    }
  }
}
