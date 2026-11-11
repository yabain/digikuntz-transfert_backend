import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import { PayinService } from './payin.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { DistributedLockService } from 'src/distributed-lock/distributed-lock.service';
import {
  getDirectChargeCloseMinutes,
} from 'src/flutterwave/direct-charge.config';
import { getNativeCmCloseMinutes } from 'src/payment/native-payin.config';
import { OrangeCmService } from 'src/orange-cm/orange-cm.service';
import { MtnCmService } from 'src/mtn-cm/mtn-cm.service';
import { CryptService } from 'src/dev/crypt.service';
import { Gateway } from 'src/gateway/gateway.schema';
import { PayinProvider, PayinStatus } from './payin.schema';
import { TransactionService } from 'src/transaction/transaction.service';
import { TStatus } from 'src/transaction/transaction.schema';

/**
 * Wall-clock budget for one direct-charge cron pass. Must stay comfortably below
 * the 25 s lock TTL so ticks never overlap.
 */
const DIRECT_CHARGE_BUDGET_MS = 18_000;

/**
 * Wall-clock budget for one native-CM cron pass. Must stay comfortably below
 * the 25 s lock TTL so ticks never overlap (same rule as the direct charge
 * cron).
 */
const NATIVE_CM_BUDGET_MS = 18_000;

@Injectable()
export class PayinCron {
  private PAYIN_CLOSE_MINUTES: number = 480; // 480 Minutes (8hours)
  private readonly logger = new Logger(PayinCron.name);
  constructor(
    private payinService: PayinService,
    private fw: FlutterwaveService,
    private readonly lockService: DistributedLockService,
    private readonly config: ConfigService,
    private readonly transactionService: TransactionService,
    private readonly orangeCmService: OrangeCmService,
    private readonly mtnCmService: MtnCmService,
    private readonly cryptService: CryptService,
    @InjectModel(Gateway.name)
    private readonly gatewayModel: mongoose.Model<Gateway>,
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
   * Réconciliation des payins natifs Cameroun (orange_cm / mtn_cm).
   *
   * Même structure que `handleDirectChargeCron` (verrou distinct, budget
   * wall-clock, fenêtre courte `NATIVE_CM_CLOSE_MINUTES`) : un débit natif
   * n'a pas de lien réutilisable, le payeur valide un push USSD / app qui
   * expire en quelques minutes.
   *
   * Chaque payin `pending` est interrogé auprès du service correspondant
   * (Orange → `meta.payToken`, MTN → `meta.xReferenceId`), le statut natif est
   * mappé (`mapStatusToLocal`) puis écrit EN TERMINAL avec la garde
   * `status: PENDING` (`markNativeCmTerminal`) : un rejeu de tick ne peut ni
   * ressusciter un payin clôturé ni créditer deux fois. Le succès emprunte
   * TOUJOURS la seule voie de crédit existante :
   * `FlutterwaveService.processSuccessfulPayin` (idempotente).
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleNativeCmCron() {
    const closeMinutes = getNativeCmCloseMinutes(this.config);

    await this.lockService.withLock('cron:payin:native', 25_000, async () => {
      const deadline = Date.now() + NATIVE_CM_BUDGET_MS;
      const pendings = await this.payinService.findPendingNativeCharges(50);

      for (const p of pendings) {
        if (Date.now() >= deadline) {
          this.logger.warn(
            `Native-CM cron budget reached with ${pendings.length} row(s) queued; remainder deferred to the next tick.`,
          );
          break;
        }

        try {
          await this.reconcileNativePayin(p, closeMinutes);
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'unknown error';
          this.logger.warn(
            `Error reconciling native payin ${p.txRef} : ${reason}`,
          );
        }
      }
    });
  }

  /**
   * Interroge le provider natif du payin, mappe le statut et écrit le terminal
   * (garde `status: PENDING`). Au-delà de la fenêtre, un payin toujours
   * `pending` est clôturé en `cancelled`.
   */
  private async reconcileNativePayin(p: any, closeMinutes: number): Promise<void> {
    const provider = String(p?.provider || '');
    const isOrange = provider === PayinProvider.ORANGE_CM;
    const isMtn = provider === PayinProvider.MTN_CM;
    if (!isOrange && !isMtn) return;

    const reference = isOrange
      ? String(p?.meta?.payToken || '')
      : String(p?.meta?.xReferenceId || '');

    // Sans identifiant de session natif (payin créé avant /pay), on ne peut pas
    // interroger le provider : on ne laisse pas le payin en suspens au-delà de
    // la fenêtre.
    if (!reference) {
      await this.closeIfExpired(p, closeMinutes);
      return;
    }

    await this.loadNativeGatewayCredentials(
      isOrange ? 'orange_cm' : 'mtn_cm',
      String(p?.meta?.gatewayId || ''),
    );

    const remote = isOrange
      ? await this.orangeCmService.getStatus(reference)
      : await this.mtnCmService.getStatus(reference);

    const mapped = isOrange
      ? OrangeCmService.mapStatusToLocal(remote.status)
      : MtnCmService.mapStatusToLocal(remote.status);

    if (mapped === 'successful') {
      const updated = await this.payinService.markNativeCmTerminal(
        p.txRef,
        PayinStatus.SUCCESSFUL,
        { raw: remote.data ?? remote },
      );
      if (updated) {
        // Voir R2 : `processSuccessfulPayin` reste la seule voie de crédit
        // (claim atomique + clés uniques de solde) — jamais de crédit direct ici.
        await this.creditSuccessfulNativePayin(p);
      }
      return;
    }

    if (mapped === 'failed') {
      const updated = await this.payinService.markNativeCmTerminal(
        p.txRef,
        PayinStatus.FAILED,
        {
          error: {
            source: provider,
            message: String(remote.reason?.message || 'Native payment failed'),
          },
          raw: remote.data ?? remote,
        },
      );
      if (updated) await this.closeNativeTransaction(p, TStatus.PAYINERROR, remote.data ?? remote);
      return;
    }

    if (mapped === 'cancelled') {
      const updated = await this.payinService.markNativeCmTerminal(
        p.txRef,
        PayinStatus.CANCELLED,
        { raw: remote.data ?? remote },
      );
      if (updated) await this.closeNativeTransaction(p, TStatus.PAYINCLOSED, remote.data ?? remote);
      return;
    }

    // Toujours pending côté provider → clôture si la fenêtre est dépassée.
    await this.closeIfExpired(p, closeMinutes);
  }

  /** Clôture en `cancelled` un payin natif resté `pending` au-delà de la fenêtre. */
  private async closeIfExpired(p: any, closeMinutes: number): Promise<void> {
    if (!this.payinService.hasExpiredInMinutes(p.createdAt, closeMinutes)) {
      return;
    }
    const updated = await this.payinService.markNativeCmTerminal(
      p.txRef,
      PayinStatus.CANCELLED,
      {
        error: {
          source: 'native_cm_cron',
          message: `Closed after ${closeMinutes} minutes without confirmation`,
        },
      },
    );
    if (updated) {
      await this.closeNativeTransaction(p, TStatus.PAYINCLOSED, undefined);
    }
  }

  /**
   * Crédite le solde via `FlutterwaveService.processSuccessfulPayin` (seule
   * voie de crédit du système, idempotente). Un échec ici ne doit pas faire
   * échouer le tick : le payin est déjà terminal et le cron de réconciliation
   * des payins `successful` (`reconcileSuccessfulPayins`) repassera.
   */
  private async creditSuccessfulNativePayin(p: any): Promise<void> {
    const transactionId = String(p?.transactionId || '');
    if (!transactionId) {
      this.logger.warn(
        `Native payin ${p.txRef} successful but has no transactionId`,
      );
      return;
    }
    try {
      const transaction = await this.transactionService.findById(transactionId);
      if (!transaction) {
        this.logger.warn(
          `Native payin ${p.txRef} successful but transaction ${transactionId} not found`,
        );
        return;
      }
      await this.fw.processSuccessfulPayin(transaction, transactionId);
    } catch (err: any) {
      this.logger.warn(
        `Native payin ${p.txRef}: processSuccessfulPayin failed: ${err?.message ?? err}`,
      );
    }
  }

  /** Clôture la transaction associée (status terminal cohérent, idempotent). */
  private async closeNativeTransaction(
    p: any,
    status: TStatus,
    raw?: any,
  ): Promise<void> {
    const transactionId = String(p?.transactionId || '');
    if (!transactionId) return;
    try {
      await this.transactionService.updateTransactionStatus(
        transactionId,
        status,
        raw,
      );
    } catch (err: any) {
      this.logger.warn(
        `Native payin ${p.txRef}: could not set transaction ${transactionId} to ${status}: ${err?.message ?? err}`,
      );
    }
  }

  /** Charge les credentials de la passerelle native (par id si connu, sinon active par type). */
  private async loadNativeGatewayCredentials(
    gatewayType: 'orange_cm' | 'mtn_cm',
    gatewayId?: string,
  ): Promise<void> {
    const gateway = gatewayId
      ? await this.gatewayModel.findById(gatewayId).exec()
      : await this.gatewayModel
          .findOne({ type: gatewayType, isActive: true })
          .exec();
    if (!gateway) {
      throw new NotFoundException(
        `No active ${gatewayType} gateway found for reconciliation`,
      );
    }
    let creds: Record<string, any> = {};
    try {
      creds = JSON.parse(
        this.cryptService.decryptWithPassphrase(gateway.credentials),
      );
    } catch {
      creds = {};
    }
    if (gatewayType === 'orange_cm') {
      this.orangeCmService.setCredentials(creds);
    } else {
      this.mtnCmService.setCredentials(creds);
    }
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