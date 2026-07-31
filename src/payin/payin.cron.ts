import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayinService } from './payin.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { DistributedLockService } from 'src/distributed-lock/distributed-lock.service';

@Injectable()
export class PayinCron {
  private PAYIN_CLOSE_MINUTES: number = 480; // 480 Minutes (8hours)
  private readonly logger = new Logger(PayinCron.name);
  constructor(
    private payinService: PayinService,
    private fw: FlutterwaveService,
    private readonly lockService: DistributedLockService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    await this.lockService.withLock('cron:payin:verify', 30_000, async () => {
      const pendings: any = await this.payinService.findPending(100);
      for (const p of pendings) {
        try {
          if (this.payinService.hasExpiredInMinutes(p.createdAt, this.PAYIN_CLOSE_MINUTES)) {
            await this.fw.verifyAndClosePayin(p.txRef, p.flwTxId);
          } else if (this.payinService.hasExpired60Minutes(p.createdAt)) {
            const currentMinute = Math.floor(Date.now() / 60000);
            const creationMinute = Math.floor(new Date(p.createdAt).getTime() / 60000);
            if (currentMinute % 15 !== creationMinute % 15) {
              continue;
            }
            await this.fw.verifyPayin(p.txRef, p.flwTxId);
          } else {
            await this.fw.verifyPayin(p.txRef, p.flwTxId);
          }
        } catch (err) {
          this.logger.warn('Error verifying tx ' + p.txRef + ' : ' + err.message);
        }
      }
    });
  }
}
