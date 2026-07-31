import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceService } from './invoice.service';

@Injectable()
export class InvoiceCron {
  private readonly logger = new Logger(InvoiceCron.name);

  constructor(private readonly invoiceService: InvoiceService) {}

  /**
   * Chaque minute, ajuste le statut des factures restées en `paying`
   * depuis plus d'une minute en fonction de la dernière transaction liée.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    try {
      const adjusted = await this.invoiceService.syncPayingInvoices();
      if (adjusted > 0) {
        this.logger.log(`Invoices status adjusted by cron: ${adjusted}`);
      }
    } catch (err: any) {
      this.logger.warn('Invoice cron failed: ' + err?.message);
    }
  }
}
