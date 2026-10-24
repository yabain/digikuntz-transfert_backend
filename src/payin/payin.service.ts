/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */ /* eslint-disable @typescript-eslint/no-unsafe-call */ /* eslint-disable @typescript-eslint/no-unsafe-return */ /* eslint-disable @typescript-eslint/no-unsafe-assignment */ /* eslint-disable @typescript-eslint/no-unsafe-member-access */ /* eslint-disable prettier/prettier */

import {
  Injectable,
  Logger,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import type { FilterQuery, UpdateQuery } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomBytes } from 'crypto';
import type { AxiosError } from 'axios';
import type { Request } from 'express';

import {
  Payin,
  PayinDocument,
  PayinProvider,
  PayinStatus,
  WebhookVerificationResult,
} from './payin.schema';
import { CreatePayinDto } from './payin.dto';
import { ConfigService } from '@nestjs/config';
import { Query } from 'express-serve-static-core';
import { MpesaService } from 'src/mpesa/mpesa.service';
import { PaystackService } from 'src/paystack/paystack.service';

type InitPayinPayload = {
  amount: number;
  currency?: string;
  customerEmail?: string;
  transactionId: string;
  txRef: string;
  meta?: Record<string, unknown>;
};

/**
 * `meta.flow` values written by the direct mobile-money charge path.
 *
 * Kept as one list so the cron queries cannot drift apart: `findPending`
 * (hosted) must exclude exactly what `findPendingDirectCharges` includes,
 * otherwise a direct payin gets polled by both windows.
 */
export const DIRECT_CHARGE_FLOWS = [
  'direct_charge',
  'payment_request',
  'invoice',
  // Un transfert payé par mobile money emprunte la même voie directe que la
  // facture : le cron doit donc lui appliquer la fenêtre courte de clôture.
  'transfer',
] as const;

/* ===== Types minimalistes FW (ce qui nous intéresse) ===== */
type FWBaseResp<T = any> = {
  status?: string; // e.g. 'success'
  message?: string;
  data?: T;
};

type FWVerifyByRefData = {
  id?: number | string;
  status?: string;          // 'successful' | 'failed' | 'pending' | ...
  tx_ref?: string;
  transaction_ref?: string;
};

type FWErrorPayload = {
  message?: string;
  status?: string;
  data?: unknown;
};

/* ====== Service ====== */
@Injectable()
export class PayinService {
  private readonly logger = new Logger(PayinService.name);

  private fwSecret = '';
  private fwPublic = '';
  private readonly fwBaseUrlV3 = 'https://api.flutterwave.com/v3';
  private readonly fwBaseUrlV4 = 'https://api.flutterwave.cloud';
  private secretHash = '';
  private readonly redirectDefault?: string;
  private mpesaBaseUrl = 'https://api.safaricom.co.ke';
  private mpesaCallbackBase = '';

  private static readonly DEFAULT_CURRENCY = 'XAF';
  private static readonly HTTP_TIMEOUT_MS = 10_000;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly mpesaService: MpesaService,
    private readonly paystackService: PaystackService,
    @InjectModel(Payin.name)
    private readonly payinModel: mongoose.Model<PayinDocument>,
  ) {
    const frontUrl = this.config.get<string>('FRONT_URL')?.replace(/\/+$/, '');
    this.redirectDefault = frontUrl ? `${frontUrl}/dashboard` : undefined;
  }

  setCredentials(creds: Record<string, any>): void {
    const secret = creds.secretKey || creds.FLUTTERWAVE_SECRET_KEY;
    const pubKey = creds.publicKey || creds.FLUTTERWAVE_PUBLIC_KEY;
    const hash = creds.secretHash || creds.FLUTTERWAVE_SECRET_HASH;
    if (secret) this.fwSecret = secret;
    if (pubKey) this.fwPublic = pubKey;
    if (hash) this.secretHash = hash;
    if (creds.MPESA_BASE_URL) this.mpesaBaseUrl = creds.MPESA_BASE_URL;
    if (creds.MPESA_STK_CALLBACK_URL) this.mpesaCallbackBase = creds.MPESA_STK_CALLBACK_URL;
  }

  /* ========================= Helpers ========================= */

  private authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.fwSecret}` };
  }

  generateTxRef(prefix = 'tx'): string {
    return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  private async updateLocalByTxRef(
    txRef: string,
    update: Partial<Payin & { raw?: unknown }>,
    options: { lean?: boolean; new?: boolean } = {},
  ) {
    const res = await this.payinModel
      .findOneAndUpdate({ txRef }, update, { new: !!options.new })
      .exec();
    return options.lean ? res?.toObject?.() : res;
  }

  private extractFWPayload(raw: unknown): {
    data: any;
    status: string;
    txRef?: string;
    flwId?: string | number;
  } {
    // tolérant : FW peut renvoyer { data: {...} } ou juste {...}
    const base =
      (raw as any)?.data?.data ??
      (raw as any)?.data ??
      raw ??
      ({} as Record<string, unknown>);

    const status: string = (base as any)?.status ?? PayinStatus.PENDING;
    const txRef: string | undefined =
      (base as any)?.tx_ref ?? (base as any)?.transaction_ref;
    const flwId: string | number | undefined =
      (base as any)?.id ?? (base as any)?.flwId;

    return { data: base, status, txRef, flwId };
  }

  private buildRedirectUrl(dtoRedirect?: string): string | undefined {
    return dtoRedirect ?? this.redirectDefault;
  }

  private normalizeKesMsisdnStrict(raw: string): string {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) {
      throw new HttpException(
        { message: 'Invalid KES mobile number: empty phone' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (/^2547\d{8}$/.test(digits)) {
      return digits;
    }

    throw new HttpException(
      {
        message:
          'Invalid KES mobile number format. Expected 2547XXXXXXXX (example: 254701234567)',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private normalizeKesMsisdnInternal(raw: string): string {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (/^2547\d{8}$/.test(digits)) return digits;
    if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
    if (/^7\d{8}$/.test(digits)) return `254${digits}`;
    return digits;
  }

  private normalizeProviderFullName(value?: string, fieldName = 'name'): string {
    const raw = String(value || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!raw) {
      throw new HttpException(
        { message: `Invalid field: ${fieldName} is required` },
        HttpStatus.BAD_REQUEST,
      );
    }
    return raw.includes(' ') ? raw : `${raw} --`;
  }

  private buildMpesaCallbackUrlWithTxRef(txRef: string): string | undefined {
    if (!this.mpesaCallbackBase) return undefined;

    const separator = this.mpesaCallbackBase.includes('?') ? '&' : '?';
    return `${this.mpesaCallbackBase}${separator}txRef=${encodeURIComponent(String(txRef || ''))}`;
  }

  private unwrapAxiosError(error: unknown): {
    fwData?: FWErrorPayload;
    message: string;
  } {
    const err = error as AxiosError<FWErrorPayload>;
    const fwData = err?.response?.data;
    const message =
      fwData?.message ??
      (fwData as any) ??
      err?.message ??
      'Unknown error from Flutterwave';
    return { fwData, message };
  }

  async fwGet<T = any>(url: string, params?: Record<string, any>) {
    return firstValueFrom(
      this.http.get<FWBaseResp<T>>(url, {
        headers: this.authHeader(),
        timeout: PayinService.HTTP_TIMEOUT_MS,
        params,
      }),
    );
  }

  async fwPost<T = any>(url: string, body: any) {
    return firstValueFrom(
      this.http.post<FWBaseResp<T>>(url, body, {
        headers: this.authHeader(),
        timeout: PayinService.HTTP_TIMEOUT_MS,
      }),
    );
  }

  /* ========================= Public API ========================= */

  async initPayin(payload: InitPayinPayload) {
    try {
      const doc = await this.payinModel.create({
        txRef: payload.txRef,
        amount: payload.amount,
        currency: payload.currency ?? PayinService.DEFAULT_CURRENCY,
        customerEmail: payload.customerEmail,
        transactionId: payload.transactionId,
        status: PayinStatus.PENDING,
        meta: payload.meta ?? {},
      });

      return {
        txRef: doc.txRef,
        amount: doc.amount,
        currency: doc.currency,
        customerEmail: doc.customerEmail,
        publicKey: this.fwPublic,
      };
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await this.payinModel.findOne({ txRef: payload.txRef }).lean().exec();
        if (existing) {
          return {
            txRef: existing.txRef,
            amount: existing.amount,
            currency: existing.currency,
            customerEmail: existing.customerEmail,
            publicKey: this.fwPublic,
          };
        }
      }
      throw error;
    }
  }

  /* ===== Direct mobile-money charges ===== */

  /**
   * Persists a `pending` payin BEFORE any charge is issued.
   *
   * Order matters: persisting first means the unique `txRef` index becomes the
   * idempotency key, so a retried request can reuse the row instead of firing a
   * second charge — and a crash after the charge can never leave an untracked
   * payment on Flutterwave's side.
   *
   * `status` is always written explicitly so a row is never created with an
   * invalid value (which would make it invisible to `findPending`).
   *
   * @param {object} dto - Payin fields; `meta.flow` identifies the product surface.
   * @returns {Promise<PayinDocument>} - The created (or already existing) payin.
   */
  async createPendingPayin(dto: {
    txRef: string;
    amount: number;
    currency: string;
    customerEmail: string;
    customerName?: string;
    transactionId: string | mongoose.Types.ObjectId;
    userId?: string;
    channel?: string;
    provider?: PayinProvider;
    redirectUrl?: string;
    meta?: Record<string, any>;
  }): Promise<PayinDocument> {
    try {
      return await this.payinModel.create({
        txRef: dto.txRef,
        amount: dto.amount,
        currency: dto.currency,
        customerEmail: dto.customerEmail,
        customerName: dto.customerName,
        transactionId: dto.transactionId,
        userId: dto.userId,
        channel: dto.channel,
        provider: dto.provider ?? PayinProvider.FLUTTERWAVE,
        redirectUrl: dto.redirectUrl,
        meta: dto.meta ?? {},
        status: PayinStatus.PENDING,
      });
    } catch (error: any) {
      // Duplicate txRef → this attempt already exists; return it so the caller
      // can decide whether a charge still has to happen.
      if (error?.code === 11000) {
        const existing = await this.payinModel
          .findOne({ txRef: dto.txRef })
          .exec();
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * Records the outcome of a charge attempt (Flutterwave id, raw envelope,
   * mapped status).
   *
   * The `transactionId` is part of the WRITE FILTER, not just bookkeeping: it
   * makes it structurally impossible to attach a charge result to a payin that
   * belongs to another transaction, even if the `txRef` used to look the row up
   * were wrong. Without this, a charge could land on a foreign payin and later be
   * credited against that other transaction's amount.
   *
   * Never downgrades a payin that already reached a terminal state, so a late or
   * replayed charge response cannot resurrect it.
   *
   * @param {string} txRef - Local reference of the attempt (server-generated).
   * @param {string|mongoose.Types.ObjectId} transactionId - Owning transaction.
   * @param {object} patch - Fields to persist; `undefined` values are skipped.
   * @returns {Promise<PayinDocument|null>} - The updated payin, or null when
   *   nothing matched (ownership mismatch, terminal state, or nothing to write).
   */
  async attachChargeResult(
    txRef: string,
    transactionId: string | mongoose.Types.ObjectId,
    patch: {
      flwTxId?: string | number;
      raw?: any;
      status?: PayinStatus;
      channel?: string;
      redirectUrl?: string;
      error?: any;
    },
  ): Promise<PayinDocument | null> {
    const update: UpdateQuery<Payin> = {};

    if (patch.flwTxId !== undefined) update.flwTxId = String(patch.flwTxId);
    if (patch.raw !== undefined) update.raw = patch.raw;
    if (patch.channel !== undefined) update.channel = patch.channel;
    if (patch.redirectUrl !== undefined) update.redirectUrl = patch.redirectUrl;
    if (patch.error !== undefined) update.error = patch.error;
    if (patch.status !== undefined) update.status = patch.status;

    const filter: FilterQuery<Payin> = { txRef, transactionId };

    if (Object.keys(update).length === 0) {
      return this.payinModel.findOne(filter).exec();
    }

    // Only guard when writing a non-terminal status: keeping a payin `pending`
    // after the webhook finalised it would replay the charge.
    if (patch.status === PayinStatus.PENDING) {
      filter.status = {
        $nin: [
          PayinStatus.SUCCESSFUL,
          PayinStatus.FAILED,
          PayinStatus.CANCELLED,
        ],
      };
    }

    return this.payinModel
      .findOneAndUpdate(filter, update, { new: true })
      .exec();
  }

  /**
   * Pending payins started by the direct-charge path, oldest first. Lets the
   * cron apply the shorter direct-charge close window without touching the
   * existing hosted `findPending` contract.
   *
   * @param {number} [limit] - Maximum number of rows to inspect.
   * @returns {Promise<PayinDocument[]>} - Pending direct-charge payins.
   */
  async findPendingDirectCharges(limit = 100): Promise<PayinDocument[]> {
    return this.payinModel
      .find({
        status: PayinStatus.PENDING,
        'meta.flow': { $in: DIRECT_CHARGE_FLOWS },
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  // Hosted Payment (V3) — Flutterwave only
  async createPayin(dto: CreatePayinDto) {
    const txRef = dto.txRef ?? this.generateTxRef('txPayin');

    const payload = {
      tx_ref: txRef,
      amount: dto.amount,
      currency: dto.currency,
      redirect_url: this.buildRedirectUrl(dto.redirectUrl),
      customer: {
        email: dto.customerEmail,
        name: this.normalizeProviderFullName(dto.customerName, 'customerName'),
      },
      meta: { app: 'digikuntz-payments', env: this.config.get('NODE_ENV') },
      payment_options: dto.channel ?? undefined,
    };

    const url = `${this.fwBaseUrlV3}/payments`;

    try {
      const resp = await this.fwPost(url, payload);
      const resData = resp.data;

      const flwTxId = (resData as any)?.data?.id;

      await this.payinModel.create({
        userId: dto.userId,
        transactionId: dto.transactionId,
        txRef,
        flwTxId,
        amount: dto.amount,
        currency: dto.currency,
        customerEmail: dto.customerEmail,
        customerName: dto.customerName,
        status: PayinStatus.PENDING,
        provider: PayinProvider.FLUTTERWAVE,
        raw: resData,
      });

      return {
        status: PayinStatus.PENDING,
        transactionId: dto.transactionId,
        txRef,
        amount: dto.amount,
        currency: dto.currency,
        customerEmail: dto.customerEmail,
        // publicKey: this.fwPublic,
        redirect_url: (resData as any)?.data?.link,
      };
    } catch (err: unknown) {
      this.logger.error('createPayin: error calling Flutterwave', err as any);
      const { fwData, message } = this.unwrapAxiosError(err);
      throw new HttpException(
        { message: message ?? 'Error creating payin', details: fwData },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async createPaymentRequestPayin(dto: CreatePayinDto) {
    const txRef = dto.txRef ?? this.generateTxRef('txPayin');
    const currency = String(dto.currency || '').toUpperCase();

    if (currency === 'KES') {
      return this.createKesMobileMoneyRequest({ ...dto, txRef });
    }

    return this.createFlutterwaveMobileMoneyRequest({ ...dto, txRef });
  }

  private async createFlutterwaveMobileMoneyRequest(
    dto: CreatePayinDto & { txRef: string },
  ) {
    const provider = String(dto.mobileMoney?.provider || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    const phone = String(dto.mobileMoney?.phone || dto.customerPhone || '')
      .replace(/\s+/g, '')
      .trim();

    if (!provider || !phone) {
      throw new HttpException(
        {
          message:
            'mobile_money.provider and mobile_money.phone are required for payment request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload: any = {
      tx_ref: dto.txRef,
      amount: Number(dto.amount),
      currency: String(dto.currency).toUpperCase(),
      email: dto.customerEmail,
      phone_number: phone,
      fullname: this.normalizeProviderFullName(
        dto.customerName,
        'customerName',
      ),
      network: provider.toUpperCase(),
      meta: { app: 'digikuntz-payments', flow: 'payment_request' },
    };

    const currency = String(dto.currency || '').toUpperCase();
    const flutterwaveChargeType =
      currency === 'XAF'
        ? 'mobile_money_franco'
        : currency === 'NGN'
          ? 'mobile_money_nigeria'
          : 'mobile_money';

    const res = await firstValueFrom(
      this.http.post(`${this.fwBaseUrlV3}/charges?type=${flutterwaveChargeType}`, payload, {
        headers: this.authHeader(),
        timeout: PayinService.HTTP_TIMEOUT_MS,
      }),
    );
    const resData = res.data;

    const checkoutRequestId =
      resData?.CheckoutRequestID || resData?.data?.CheckoutRequestID || '';
    const merchantRequestId =
      resData?.MerchantRequestID || resData?.data?.MerchantRequestID || '';

    await this.payinModel.create({
      userId: dto.userId,
      transactionId: dto.transactionId,
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      customerName: dto.customerName,
      channel: 'mobile_money',
      status: PayinStatus.PENDING,
      provider: PayinProvider.FLUTTERWAVE,
      raw: resData,
    });

    return {
      status: PayinStatus.PENDING,
      transactionId: dto.transactionId,
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      provider: PayinProvider.FLUTTERWAVE,
      details: resData?.data ?? resData,
      redirect_url: resData?.data?.link || resData?.data?.auth_url,
    };
  }

  private async createKesMobileMoneyRequest(
    dto: CreatePayinDto & { txRef: string },
  ) {
    const amount = Math.round(Number(dto.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { message: 'Invalid payment amount' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const provider = String(dto.mobileMoney?.provider || 'm-pesa');
    const phone = this.normalizeKesMsisdnStrict(
      String(dto.mobileMoney?.phone || dto.customerPhone || ''),
    );

    if (!phone) {
      throw new HttpException(
        { message: 'mobile_money.phone is required for KES payment request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const resData = await this.mpesaService.initiateStkPush({
      phone,
      amount,
      reference: dto.txRef,
      description: `Payment request ${provider}`,
      callbackUrl: this.buildMpesaCallbackUrlWithTxRef(dto.txRef),
    });

    const checkoutRequestId =
      resData?.CheckoutRequestID || resData?.data?.CheckoutRequestID || '';
    const merchantRequestId =
      resData?.MerchantRequestID || resData?.data?.MerchantRequestID || '';

    await this.payinModel.create({
      userId: dto.userId,
      transactionId: dto.transactionId,
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      customerName: dto.customerName,
      channel: 'mobile_money',
      status: PayinStatus.PENDING,
      provider: PayinProvider.MPESA,
      raw: {
        ...resData,
        checkoutRequestId,
        merchantRequestId,
      },
    });

    return {
      status: PayinStatus.PENDING,
      transactionId: dto.transactionId,
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      provider: PayinProvider.MPESA,
      details: resData?.data ?? resData,
      redirect_url: null,
    };
  }

  private mapMpesaStatusToLocal(raw?: any): PayinStatus {
    const status = this.mpesaService.mapStkStatusToLocal(raw);
    if (status === 'successful') return PayinStatus.SUCCESSFUL;
    if (status === 'failed') return PayinStatus.FAILED;
    if (status === 'cancelled') return PayinStatus.CANCELLED;
    return PayinStatus.PENDING;
  }

  async createMpesaPayin(dto: CreatePayinDto & { txRef: string }) {
    const amount = Math.round(Number(dto.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { message: 'Invalid payment amount' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const normalizedFromInternal = this.normalizeKesMsisdnInternal(
      String(dto.customerPhone || ''),
    );
    const phone = this.normalizeKesMsisdnStrict(normalizedFromInternal);
    if (!phone) {
      throw new HttpException(
        { message: 'customerPhone is required for KES M-Pesa payin' },
        HttpStatus.BAD_REQUEST,
      );
    }

    console.log('payin payload to mpesa:', JSON.stringify({
      phone,
      amount,
      reference: dto.txRef,
      description: 'Payin',
      callbackUrl: this.buildMpesaCallbackUrlWithTxRef(dto.txRef),
    }, null, 2));
    
    const resData = await this.mpesaService.initiateStkPush({
      phone,
      amount,
      reference: dto.txRef,
      description: 'Payin',
      callbackUrl: this.buildMpesaCallbackUrlWithTxRef(dto.txRef),
    });

    const checkoutRequestId =
      resData?.CheckoutRequestID || resData?.data?.CheckoutRequestID || '';
    const merchantRequestId =
      resData?.MerchantRequestID || resData?.data?.MerchantRequestID || '';

    const payin = await this.payinModel.create({
      userId: dto.userId,
      transactionId: dto.transactionId,
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      customerName: dto.customerName,
      channel: 'mobile_money',
      status: PayinStatus.PENDING,
      provider: PayinProvider.MPESA,
      raw: {
        ...resData,
        checkoutRequestId,
        merchantRequestId,
      },
    });

    console.log('payin resp: ', payin);

    return {
      status: PayinStatus.PENDING,
      transactionId: dto.transactionId,
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      provider: PayinProvider.MPESA,
      redirect_url: null,
      details: resData?.data ?? resData,
    };
  }

  async createPaystackPayin(data: {
    userId: any;
    transactionId: string;
    txRef: string;
    amount: number;
    currency: string;
    customerEmail: string;
    customerName?: string;
    raw?: any;
  }) {
    return this.payinModel.create({
      userId: data.userId,
      transactionId: data.transactionId,
      txRef: data.txRef,
      amount: data.amount,
      currency: data.currency,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      channel: 'mobile_money',
      status: PayinStatus.PENDING,
      provider: PayinProvider.PAYSTACK,
      raw: data.raw,
    });
  }

  private async verifyMpesaByReference(reference: string, closeMode = false) {
    const local = await this.payinModel.findOne({ txRef: reference }).lean().exec();
    if (!local) {
      throw new HttpException(
        { message: `Local transaction ${reference} not found` },
        HttpStatus.NOT_FOUND,
      );
    }

    // Never reopen a terminal payin status (callback may have already closed it).
    if (
      local.status === PayinStatus.SUCCESSFUL ||
      local.status === PayinStatus.FAILED ||
      local.status === PayinStatus.CANCELLED
    ) {
      return local;
    }

    const checkoutRequestId =
      local?.raw?.checkoutRequestId ||
      local?.raw?.CheckoutRequestID ||
      local?.raw?.data?.CheckoutRequestID ||
      local?.raw?.Body?.stkCallback?.CheckoutRequestID;

    if (!checkoutRequestId) {
      const fallbackStatus = closeMode ? PayinStatus.CANCELLED : PayinStatus.PENDING;
      return this.payinModel
        .findOneAndUpdate(
          { txRef: reference },
          { status: fallbackStatus, provider: PayinProvider.MPESA },
          { new: true },
        )
        .lean()
        .exec();
    }

    let verifyResp: any;
    try {
      verifyResp = await this.mpesaService.queryStkStatus(checkoutRequestId);
    } catch (error: any) {
      const details =
        typeof error?.getResponse === 'function'
          ? error.getResponse()
          : error?.response?.data || error;
      const errorCode = String(details?.details?.errorCode || details?.errorCode || '');
      const errorMessage = String(
        details?.details?.errorMessage || details?.errorMessage || details?.message || '',
      ).toLowerCase();
      const isTemporaryUnavailable =
        errorCode === '500.002.1001' ||
        errorCode === '500.001.1001' ||
        errorMessage.includes('temporarily unavailable');

      if (isTemporaryUnavailable) {
        this.logger.warn(
          `verifyMpesaByReference: temporary M-Pesa outage for txRef=${reference}, preserving local status=${String(local?.status || PayinStatus.PENDING)}`,
        );
        const preservedStatus =
          local?.status || (closeMode ? PayinStatus.CANCELLED : PayinStatus.PENDING);
        return this.payinModel
          .findOneAndUpdate(
            { txRef: reference },
            {
              status: preservedStatus,
              provider: PayinProvider.MPESA,
              raw: {
                ...(local?.raw || {}),
                lastQueryError: details,
                lastQueryAt: new Date().toISOString(),
              },
            },
            { new: true },
          )
          .lean()
          .exec();
      }

      throw error;
    }
    const status = this.mapMpesaStatusToLocal(verifyResp);

    const nextStatus =
      status === PayinStatus.SUCCESSFUL || closeMode
        ? status
        : PayinStatus.PENDING;

    const updated = await this.payinModel
      .findOneAndUpdate(
        { txRef: reference },
        {
          status: nextStatus,
          provider: PayinProvider.MPESA,
          raw: verifyResp,
        },
        { new: true },
      )
      .lean()
      .exec();

    return updated;
  }

  private async verifyPaystackByReference(reference: string, closeMode = false) {
    const local = await this.payinModel.findOne({ txRef: reference }).lean().exec();
    if (!local) {
      throw new HttpException(
        { message: `Local transaction ${reference} not found` },
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      local.status === PayinStatus.SUCCESSFUL ||
      local.status === PayinStatus.FAILED ||
      local.status === PayinStatus.CANCELLED
    ) {
      return local;
    }

    const paystackRef = local?.raw?.reference || local?.raw?.data?.reference || reference;
    let verifyResp: any;
    try {
      verifyResp = await this.paystackService.verifyTransaction(paystackRef);
    } catch {
      const fallbackStatus = closeMode ? PayinStatus.CANCELLED : PayinStatus.PENDING;
      return this.payinModel
        .findOneAndUpdate(
          { txRef: reference },
          { status: fallbackStatus },
          { new: true },
        )
        .lean()
        .exec();
    }

    const paystackStatus = String(verifyResp?.data?.status || '').toLowerCase();
    let newStatus = PayinStatus.PENDING;
    if (paystackStatus === 'success') newStatus = PayinStatus.SUCCESSFUL;
    else if (paystackStatus === 'failed') newStatus = PayinStatus.FAILED;
    else if (paystackStatus === 'abandoned') newStatus = PayinStatus.CANCELLED;

    return this.payinModel
      .findOneAndUpdate(
        { txRef: reference },
        { status: newStatus, raw: { ...(local?.raw || {}), verifyResp } },
        { new: true },
      )
      .lean()
      .exec();
  }

  /**
   * Save FW webhook/result payload into local DB
   */
  async saveFlutterwaveResult(raw: unknown) {
    // console.log('saveFlutterwaveResult in: ', raw);
    const { data, status, txRef, flwId } = this.extractFWPayload(raw);

    // console.log('saveFlutterwaveResult out:', this.extractFWPayload(raw));

    if (!txRef) {
      this.logger.warn('saveFlutterwaveResult: missing tx_ref in payload');
      throw new HttpException(
        { message: 'Missing tx_ref' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const local = await this.payinModel.findOne({ txRef }).lean().exec();
    if (!local) {
      this.logger.warn(`Payin verify: txRef ${txRef} not found in DB`);
      throw new HttpException(
        { message: `Local transaction ${txRef} not found` },
        HttpStatus.NOT_FOUND,
      );
    }

    const updated = await this.payinModel
      .findOneAndUpdate(
        { txRef, status: { $nin: ['successful', 'failed', 'cancelled'] } },
        {
          status,
          flwTxId: String(flwId ?? ''),
          raw: data,
        },
        { new: true },
      )
      .exec();

    return updated || local;
  }

  /**
   * Verify payin by txRef using Flutterwave v3 verify_by_reference endpoint
   */
  async verifyPayinByTxRef(txRef: string) {
    const local = await this.payinModel.findOne({ txRef }).lean().exec();
    if (!local) {
      this.logger.warn(`verifyPayinByTxRef: txRef ${txRef} not found locally`);
      throw new HttpException(
        { message: `Local transaction ${txRef} not found` },
        HttpStatus.NOT_FOUND,
      );
    }

    const url = `${this.fwBaseUrlV3}/transactions/verify_by_reference`;
    try {
      this.logger.debug(
        `Calling Flutterwave verify_by_reference for tx_ref=${txRef}`,
      );

      const resp = await this.fwGet<FWVerifyByRefData>(url, { tx_ref: txRef });
      const data = resp.data;
      const status =
        (data?.data as FWVerifyByRefData)?.status ??
        data?.status ??
        PayinStatus.PENDING;

      const updated = await this.payinModel
        .findOneAndUpdate(
          { txRef, status: { $nin: ['successful', 'failed', 'cancelled'] } },
          {
            status,
            raw: data,
            flwTxId: (data?.data as FWVerifyByRefData)?.id,
          },
          { new: true },
        )
        .exec();

      if (updated) {
        this.logger.log(
          `Payin ${txRef} updated to status=${status} (flwId=${(data?.data as FWVerifyByRefData)?.id})`,
        );
      }
      return updated || local;
    } catch (error: unknown) {
      const { fwData, message } = this.unwrapAxiosError(error);

      this.logger.error(`Error verifying tx ${txRef}: ${message}`, fwData ?? '');
      await this.payinModel
        .findOneAndUpdate(
          { txRef, status: { $nin: ['successful', 'failed', 'cancelled'] } },
          { status: PayinStatus.FAILED, error: fwData ?? message },
          { new: true },
        )
        .exec();

      throw new HttpException({ message }, HttpStatus.BAD_GATEWAY);
    }
  }

  async getPayinById(payinId: string) {
    return this.payinModel.findById(payinId).lean().exec();
  }

  async getPayinByTxRef(txRef: string) {
    return this.payinModel.findOne({ txRef }).lean().exec();
  }

  async getPayinByTransactionId(transactionId: string) {
    return this.payinModel.findOne({ transactionId }).lean().exec();
  }

  async getPayinStatus(txRef: string) {
    const data = await this.payinModel.findOne({ txRef }).lean().exec();
    if (!data) {
      throw new HttpException(
        { message: `Transaction ${txRef} not found` },
        HttpStatus.NOT_FOUND,
      );
    }
    return { status: data.status };
  }

  /**
   * Pending payins of the HOSTED route, oldest first.
   *
   * Direct-charge flows are excluded on purpose: they are verified by their own
   * cron on a much shorter window, and including them here made each direct payin
   * be polled twice per cycle (double upstream calls, double quota). A payin with
   * no `meta.flow` — every hosted one — still matches, because `$nin` also
   * matches documents where the path is missing.
   *
   * @param {number} [limit] - Maximum number of rows.
   * @returns {Promise<PayinDocument[]>} - Pending hosted payins.
   */
  async findPending(limit = 1000) {
    return this.payinModel
      .find({
        status: PayinStatus.PENDING,
        'meta.flow': { $nin: DIRECT_CHARGE_FLOWS },
      })
      .limit(limit)
      .exec();
  }

  /**
   * Payins confirmés `successful` par la passerelle liés à une facture,
   * utilisés par le cron de réconciliation pour finaliser (claim / crédit /
   * facture) les paiements restés en attente alors que la passerelle a
   * encaissé (webhook non délivré, erreur transitoire).
   * Idempotent : la réconciliation peut repasser plusieurs fois.
   */
  async findSuccessfulUnclaimed(limit = 100) {
    return this.payinModel
      .aggregate([
        {
          $match: {
            status: PayinStatus.SUCCESSFUL,
            transactionId: { $type: 'objectId' },
          },
        },
        {
          $lookup: {
            from: 'transactions',
            localField: 'transactionId',
            foreignField: '_id',
            as: 'tx',
          },
        },
        { $unwind: { path: '$tx', preserveNullAndEmptyArrays: false } },
        { $match: { 'tx.transactionType': 'invoice' } },
        {
          $addFields: {
            invoiceObjectId: {
              $convert: {
                input: '$tx.invoiceId',
                to: 'objectId',
                onError: null,
                onNull: null,
              },
            },
          },
        },
        {
          $lookup: {
            from: 'invoices',
            localField: 'invoiceObjectId',
            foreignField: '_id',
            as: 'inv',
          },
        },
        {
          $match: {
            $or: [
              { $expr: { $not: { $gt: [{ $size: '$inv' }, 0] } } },
              { 'inv.payed': { $ne: true, $exists: true } },
            ],
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
      ])
      .exec();
  }

  /**
   * Whether a payin has been pending longer than `duration` minutes.
   *
   * An unknown or unparseable date returns `false` (fail-safe: a payin we cannot
   * date is never force-closed). This also matches the previous behaviour, where
   * `NaN > x` was already false.
   *
   * @param {string|Date} [inputDate] - Creation date of the record.
   * @param {number} [duration] - Window in minutes. Defaults to 15.
   * @returns {boolean} - True when the record is past the window.
   */
  hasExpiredInMinutes(
    inputDate?: string | Date,
    duration: number = 15,
  ): boolean {
    if (!inputDate) return false;

    const target = new Date(inputDate).getTime();
    if (Number.isNaN(target)) return false;

    const now = Date.now();
    const diff = now - target;
    return diff > duration * 60 * 1000;
  }

  hasExpired60Minutes(inputDate: string | Date): boolean {
    const target = new Date(inputDate).getTime();
    const now = Date.now();
    const diff = now - target;

    // console.log(
    //   '[DEBUG hasExpired60Minutes]',
    //   'input:',
    //   inputDate,
    //   'parsed:',
    //   new Date(inputDate).toISOString(),
    //   'now:',
    //   new Date(now).toISOString(),
    //   'diff (minutes):',
    //   diff / 60 * 1000,
    // );

    return diff > 60 * 60 * 1000;
  }

  async updatePayinStatus(txRef: string, status: string) {
    return this.payinModel
      .findOneAndUpdate({ txRef }, { status }, { new: true })
      .exec();
  }

  async updatePayin(data: any, status: string) {
    const txRef = data?.tx_ref ?? data?.txRef;
    if (!txRef)
      throw new HttpException(
        { message: 'tx_ref is required' },
        HttpStatus.BAD_REQUEST,
      );
    return this.payinModel
      .findOneAndUpdate(
        { txRef },
        { status, flwTxId: String(data?.id ?? ''), raw: data },
        { new: true },
      )
      .exec();
  }

  /**
   * Generic verify: accept either numeric FW id or txRef
   */
  async verifyPayin(idOrTxRef: string, saveLocal = false, flwTxId?: string) {
    const localAnyRef = await this.payinModel
      .findOne({ $or: [{ txRef: idOrTxRef }, { flwTxId: String(idOrTxRef) }] })
      .lean()
      .exec();

    if (localAnyRef?.provider === PayinProvider.PAYSTACK) {
      return this.verifyPaystackByReference(String(localAnyRef.txRef), saveLocal);
    }
    if (localAnyRef?.provider === PayinProvider.MPESA) {
      return this.verifyMpesaByReference(String(localAnyRef.txRef), saveLocal);
    }

    // console.log('verifyPayin: idOrTxRef', idOrTxRef);
    try {
      let resp;
      const effectiveFlwTxId = flwTxId || localAnyRef?.flwTxId;
      if (effectiveFlwTxId) {
        // Use numeric ID endpoint when available (most reliable)
        resp = await this.fwGet(`${this.fwBaseUrlV3}/transactions/${effectiveFlwTxId}/verify`);
      } else if (/^\d+$/.test(idOrTxRef)) {
        // numeric -> verify by tx id
        resp = await this.fwGet(`${this.fwBaseUrlV3}/transactions/${idOrTxRef}/verify`);
      } else {
        // this.logger.debug(`verifyPayin: idOrTxRef is txRef: ${idOrTxRef}`);
        resp = await this.fwGet(`${this.fwBaseUrlV3}/transactions/verify_by_reference`, {
          tx_ref: idOrTxRef,
        });
      }

      // console.log(
      //   `Flutterwave response for ${idOrTxRef}: ${resp.data}`,
      // );
      const respData = resp.data;
      // console.log('resp.data: ', respData);
      if (respData.data.status === 'successful' || respData.data.status === 'pending') {
        // console.log('Rewrite payin: respData.data.status is successful or pending');
        return this.handleVerifyPayin(idOrTxRef, true, resp.data);
      }

      // console.log('Not Rewrite payin: respData.data.status is successful or pending');
      return this.handleVerifyPayin(idOrTxRef, saveLocal, resp.data);
    } catch (error: unknown) {
      const { fwData, message } = this.unwrapAxiosError(error);
      // this.logger.error(`verifyPayin error for ${idOrTxRef}: ${message}`, fwData ?? '');

      // Si FW indique "not found", on renvoie l'enregistrement local au lieu de throw
      if (fwData?.message?.includes('No transaction was found for this id')) {
        // this.logger.warn('No transaction found on FW, returning local record');
        return this.handleVerifyPayin(idOrTxRef, saveLocal);
      }

      if (saveLocal) {
        // On ne marque en failed qu'en mode close; sinon on laisse pending.
        await this.payinModel
          .findOneAndUpdate(
            { txRef: idOrTxRef },
            { status: PayinStatus.FAILED, error: fwData ?? message },
            { new: true },
          )
          .exec();
      } else {
        return this.handleVerifyPayin(idOrTxRef, false);
      }

      throw new HttpException({ message }, HttpStatus.BAD_GATEWAY);
    }
  }


  private async handleVerifyPayin(txRef: string, saveLocal = false, resData?: any) {

    if (resData && saveLocal) {
      this.logger.debug('handleVerifyPayin: saving FW result and returning');
      return this.saveFlutterwaveResult({ data: resData });
    }

    this.logger.debug('handleVerifyPayin: returning local record only');
    return this.payinModel.findOne({ txRef: txRef }).lean().exec();
  }

  async handleMpesaStkCallback(payload: any, txRefHint?: string) {
    const callback = payload?.Body?.stkCallback || payload?.stkCallback || payload || {};
    const checkoutRequestId = String(callback?.CheckoutRequestID || '');
    const merchantRequestId = String(callback?.MerchantRequestID || '');
    const resultCode = Number(callback?.ResultCode);
    const resultDesc = String(callback?.ResultDesc || '');

    const metadataItems = Array.isArray(callback?.CallbackMetadata?.Item)
      ? callback.CallbackMetadata.Item
      : [];
    const findItem = (name: string) =>
      metadataItems.find((item: any) => String(item?.Name || '').toLowerCase() === name.toLowerCase());

    const accountReference =
      String(
        findItem('AccountReference')?.Value ||
        findItem('BillRefNumber')?.Value ||
        '',
      ).trim();

    let payin: any = null;
    if (txRefHint) {
      payin = await this.payinModel.findOne({ txRef: String(txRefHint) }).lean().exec();
    }

    if (accountReference) {
      payin = await this.payinModel.findOne({ txRef: accountReference }).lean().exec();
    }

    if (!payin && checkoutRequestId) {
      payin = await this.payinModel
        .findOne({
          $or: [
            { 'raw.checkoutRequestId': checkoutRequestId },
            { 'raw.CheckoutRequestID': checkoutRequestId },
            { 'raw.data.CheckoutRequestID': checkoutRequestId },
            { 'raw.Body.stkCallback.CheckoutRequestID': checkoutRequestId },
          ],
        })
        .lean()
        .exec();
    }

    if (!payin && merchantRequestId) {
      payin = await this.payinModel
        .findOne({
          $or: [
            { 'raw.merchantRequestId': merchantRequestId },
            { 'raw.MerchantRequestID': merchantRequestId },
            { 'raw.data.MerchantRequestID': merchantRequestId },
            { 'raw.Body.stkCallback.MerchantRequestID': merchantRequestId },
          ],
        })
        .lean()
        .exec();
    }

    if (!payin) {
      return {
        accepted: false,
        message: 'Payin not found for callback',
        context: { txRefHint, checkoutRequestId, merchantRequestId, accountReference },
      };
    }

    const nextStatus = this.mapMpesaStatusToLocal(callback);
    const mergedRaw = {
      ...(payin?.raw || {}),
      callback: payload,
      checkoutRequestId,
      merchantRequestId,
      resultCode,
      resultDesc,
      callbackReceivedAt: new Date().toISOString(),
    };

    const updated = await this.payinModel
      .findOneAndUpdate(
        { txRef: payin.txRef },
        {
          status: nextStatus,
          provider: PayinProvider.MPESA,
          raw: mergedRaw,
        },
        { new: true },
      )
      .lean()
      .exec();

    return {
      accepted: true,
      txRef: payin.txRef,
      transactionId: String(payin.transactionId),
      status: nextStatus,
      resultCode,
      resultDesc,
      checkoutRequestId,
      payin: updated,
    };
  }

  /**
   * Verifies a Flutterwave webhook and applies the resulting status transition.
   *
   * Hardening over the previous implementation:
   * - the `verif-hash` header is compared against the configured hash AND every
   *   alternate hash supplied by the caller (`extraHashes`). A multi-currency
   *   merchant account can notify with any of its gateways' hashes, and after a
   *   restart `secretHash` is only populated once a charge has run — this made
   *   early webhooks fail with 401 and silently drop a real payment;
   * - `charge.completed` is now handled for `successful` AND `failed`/
   *   `cancelled`. Previously a failed charge was acknowledged and ignored, so
   *   the payin stayed `pending` until the cron closed it;
   * - the write is a single conditional `findOneAndUpdate` guarded on a
   *   non-terminal status, so duplicate deliveries are idempotent and a late
   *   success can never overwrite a terminal state.
   *
   * @param {Request & {body?: any; headers?: any}} req - Raw webhook request.
   * @param {string[]} [extraHashes] - Additional accepted secret hashes.
   * @returns {Promise<WebhookVerificationResult>} - Resolves for
   *   every accepted delivery; throws 401 only when the signature is unknown.
   */
  async verifyWebhook(
    req: Request & { body?: any; headers?: any },
    extraHashes: string[] = [],
  ): Promise<WebhookVerificationResult> {
    const signature = (req.headers as any)['verif-hash'] as string | undefined;
    const body = req.body ?? {};

    if (!this.isAcceptedSignature(signature, extraHashes)) {
      this.logger.warn('Invalid Flutterwave webhook signature');
      throw new UnauthorizedException('Invalid Flutterwave webhook signature');
    }

    if (body.event !== 'charge.completed') {
      return { status: 'ok', ignored: `event:${body.event ?? 'unknown'}` };
    }

    const txRef = body.data?.tx_ref;
    const flwTxId = body.data?.id;
    const mapped = this.mapWebhookStatus(body.data?.status);

    if (!mapped) {
      return {
        status: 'ok',
        ignored: `status:${body.data?.status ?? 'unknown'}`,
      };
    }

    const or: Record<string, any>[] = [];
    if (flwTxId !== undefined && flwTxId !== null) or.push({ flwTxId });
    if (txRef) or.push({ txRef });

    if (or.length === 0) {
      return { status: 'ok', ignored: 'missing_identifiers' };
    }

    const update: Record<string, any> = { status: mapped };
    if (flwTxId !== undefined && flwTxId !== null) update.flwTxId = flwTxId;

    if (mapped === PayinStatus.FAILED) {
      // Store WHY it failed, without echoing the whole upstream payload.
      update.error = {
        source: 'flutterwave-webhook',
        message:
          body.data?.processor_response ??
          body.data?.narration ??
          'Charge failed',
        status: body.data?.status,
      };
    }

    const payin = await this.payinModel
      .findOneAndUpdate(
        {
          $or: or,
          status: {
            $nin: [
              PayinStatus.SUCCESSFUL,
              PayinStatus.FAILED,
              PayinStatus.CANCELLED,
            ],
          },
        },
        update,
        { new: true },
      )
      .exec();

    return { status: 'ok', payin };
  }

  /**
   * True when `signature` matches the configured hash or one of the accepted
   * alternates. Blank candidates are dropped so a missing configuration can
   * never be satisfied by an empty header.
   *
   * @param {string|undefined} signature - Raw `verif-hash` header value.
   * @param {string[]} extraHashes - Additional accepted hashes.
   * @returns {boolean} - Whether the delivery is trusted.
   */
  private isAcceptedSignature(
    signature: string | undefined,
    extraHashes: string[],
  ): boolean {
    if (!signature || typeof signature !== 'string') return false;

    const accepted = new Set(
      [this.secretHash, ...extraHashes].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      ),
    );

    return accepted.has(signature);
  }

  /**
   * Maps a Flutterwave webhook `data.status` onto a local `PayinStatus`.
   *
   * @param {unknown} status - The upstream status value.
   * @returns {PayinStatus|null} - null when the delivery is not actionable.
   */
  private mapWebhookStatus(status: unknown): PayinStatus | null {
    // Explicit narrowing: stringifying an unexpected object would yield
    // '[object Object]' and could never match a known status.
    const value =
      typeof status === 'string' || typeof status === 'number'
        ? String(status).trim().toLowerCase()
        : '';

    if (value === 'successful' || value === 'success') {
      return PayinStatus.SUCCESSFUL;
    }
    if (value === 'failed' || value === 'error') return PayinStatus.FAILED;
    if (value === 'cancelled' || value === 'canceled') {
      return PayinStatus.CANCELLED;
    }

    return null;
  }

  async getAllPayinTransactoins(query: Query): Promise<any[]> {
    const resPerPage = Number(query?.limit || query?.resPerPage) || 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    let keywordFilter: any = {};
    if (typeof query.keyword === 'string' && query.keyword) {
      const kw = query.keyword;
      const conditions: any[] = [
        { txRef: { $regex: kw, $options: 'i' } },
        { customerName: { $regex: kw, $options: 'i' } },
        { customerEmail: { $regex: kw, $options: 'i' } },
      ];
      if (mongoose.Types.ObjectId.isValid(kw)) {
        conditions.push({ _id: new mongoose.Types.ObjectId(kw) });
        conditions.push({ transactionId: new mongoose.Types.ObjectId(kw) });
      }
      keywordFilter = { $or: conditions };
    }
    const transactions = await this.payinModel
      .find(keywordFilter)
      .limit(resPerPage)
      .sort({ createdAt: -1 }) // Sort recent to old
      .skip(skip)
      .populate('transactionId');
    return transactions;
  }

  async getTotalTransaction(): Promise<number> {
    return await this.payinModel.countDocuments();
  }

  async getTotalTransactionOfUser(userId: string): Promise<number> {
    return await this.payinModel.countDocuments({ userId });
  }
}
