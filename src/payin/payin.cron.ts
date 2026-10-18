import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayinService } from './payin.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { DistributedLockService } from 'src/distributed-lock/distributed-lock.service';
import { getDirectChargeCloseMinutes } from 'src/flutterwave/direct-charge.config';

/**
 * Wall-clock budget for one direct-charge cron pass. Must stay comfortably below
 * the 25 s lock TTL so ticks never overlap.
 */
const DIRECT_CHARGE_BUDGET_MS = 18_000;

@Injectable()
export class PayinCron {
  private PAYIN_CLOSE_MINUTES: number = 480; // 480 Minutes (8hours)
  private readonly logger = new Logger(PayinCron.name);
  constructor(
    private payinService: PayinService,
    private fw: FlutterwaveService,
    private readonly lockService: DistributedLockService,
    private readonly config: ConfigService,
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

  /**
   * Direct mobile-money charges get their own, much shorter closing window.
   *
   * A direct charge has no reusable link: the payer approves a USSD / app push
   * that expires within minutes. Keeping such a payin `pending` for the hosted
   * 8-hour window would leave the payer stuck on a loader and inflate the queue.
   * The window is configurable via `DIRECT_CHARGE_CLOSE_MINUTES`.
   *
   * The run is bounded by WALL CLOCK, not by row count: each verification can
   * take up to the 30 s API timeout, so a large batch would outlive the lock and
   * the next tick would overlap it. Remaining rows are picked up on the next
   * pass, which is harmless because everything here is idempotent.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleDirectChargeCron() {
    const closeMinutes = getDirectChargeCloseMinutes(this.config);

    await this.lockService.withLock('cron:payin:direct', 25_000, async () => {
      const deadline = Date.now() + DIRECT_CHARGE_BUDGET_MS;
      const pendings = await this.payinService.findPendingDirectCharges(50);

      for (const p of pendings) {
        if (Date.now() >= deadline) {
          this.logger.warn(
            `Direct-charge cron budget reached with ${
              pendings.length
            } row(s) queued; remainder deferred to the next tick.`,
          );
          break;
        }

        try {
          if (
            this.payinService.hasExpiredInMinutes(p.createdAt, closeMinutes)
          ) {
            await this.fw.verifyAndClosePayin(p.txRef, p.flwTxId);
          } else {
            await this.fw.verifyPayin(p.txRef, p.flwTxId);
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'unknown error';
          this.logger.warn(
            `Error verifying direct charge ${p.txRef} : ${reason}`,
          );
        }
      }
    });
  }

  /**
   * Filet de sécurité : finalise les payins "successful" liés à des factures
   * jamais finalisées (webhook non délivré ou finalisation en erreur).
   * Exécuté toutes les 15 minutes : les paiements se résolvent normalement
   * via le webhook / la vérification ; ce cron ne couvre que les cas orphelins.
   */
  @Cron('0 */15 * * * *')
  async handleReconcile() {
    await this.lockService.withLock('cron:payin:reconcile', 60_000, async () => {
      try {
        const adjusted = await this.fw.reconcileSuccessfulPayins();
        if (adjusted > 0) {
          this.logger.log(`Reconciled successful payins: ${adjusted}`);
        }
      } catch (err) {
        this.logger.warn('reconcileSuccessfulPayins failed: ' + err.message);
      }
    });
  }
}
