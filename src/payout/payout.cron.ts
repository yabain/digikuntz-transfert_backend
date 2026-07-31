/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayoutService } from './payout.service';
import { DistributedLockService } from 'src/distributed-lock/distributed-lock.service';

@Injectable()
export class PayoutCron {
  private readonly logger = new Logger(PayoutCron.name);

  constructor(
    private payoutService: PayoutService,
    private readonly lockService: DistributedLockService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    await this.lockService.withLock('cron:payout:verify', 120_000, async () => {
      const processings: any = await this.payoutService.findPending(1000);
      for (const p of processings) {
        try {
          await this.payoutService.verifyPayout(p.reference, false, p.flwTxId);
          if (
            p.provider === 'mpesa' &&
            this.payoutService.isMoreThan8HoursAhead(p.updatedAt)
          ) {
            this.logger.warn(`(payout cron) M-Pesa payout ${p.reference} stuck for 8+ hours, force-failing`);
            await this.payoutService.forceFailStuckPayout(p.reference, String(p.transactionId));
          }
        } catch (err) {
          if (this.payoutService.isMoreThan8HoursAhead(p.updatedAt)) {
            this.payoutService.forceFailStuckPayout(p.reference, String(p.transactionId));
          }
          this.logger.warn('(payout cron)Error verifying payout ' + p.reference + ' : ' + err.message);
        }
      }
    });
  }
}
