import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentRequestService } from './payment-request.service';

@Injectable()
export class PaymentRequestCron {
  private readonly logger = new Logger(PaymentRequestCron.name);
  private isRunning = false;

  constructor(private readonly paymentRequestService: PaymentRequestService) {}

  @Cron('*/15 * * * * *')
  async syncPendingRequests(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Payment request cron already running, skipping...');
      return;
    }

    this.isRunning = true;
    try {
      const updated = await this.paymentRequestService.syncPendingPaymentRequests();
      if (updated > 0) {
        this.logger.log(`Updated ${updated} payment request(s) from pending`);
      }
    } finally {
      this.isRunning = false;
    }
  }
}
