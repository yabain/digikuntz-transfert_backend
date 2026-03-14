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
import type mongoose from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomBytes } from 'crypto';
import type { AxiosError } from 'axios';
import type { Request } from 'express';

import { Payin, PayinDocument, PayinProvider, PayinStatus } from './payin.schema';
import { CreatePayinDto } from './payin.dto';
import { ConfigService } from '@nestjs/config';
import { Query } from 'express-serve-static-core';
import { PaystackService } from 'src/paystack/paystack.service';

type InitPayinPayload = {
  amount: number;
  currency?: string;
  customerEmail?: string;
  transactionId: string;
  txRef: string;
  meta?: Record<string, unknown>;
};

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

  private readonly fwSecret: string;
  private readonly fwPublic: string;
  private readonly fwBaseUrlV3: string;
  private readonly fwBaseUrlV4: string; // conservé (non utilisé ici)
  private readonly secretHash?: string;
  private readonly redirectDefault?: string;

  private static readonly DEFAULT_CURRENCY = 'XAF';
  private static readonly HTTP_TIMEOUT_MS = 10_000;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly paystackService: PaystackService,
    @InjectModel(Payin.name)
    private readonly payinModel: mongoose.Model<PayinDocument>,
  ) {
    this.fwSecret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY') ?? '';
    this.fwPublic = this.config.get<string>('FLUTTERWAVE_PUBLIC_KEY') ?? '';
    this.fwBaseUrlV3 =
      this.config.get<string>('FLUTTERWAVE_BASE_URL_V3') ??
      'https://api.flutterwave.com/v3';
    this.fwBaseUrlV4 =
      this.config.get<string>('FLUTTERWAVE_BASE_URL_V4') ??
      'https://api.flutterwave.cloud';
    this.secretHash = this.config.get<string>('FLUTTERWAVE_SECRET_HASH');
    this.redirectDefault = this.config.get<string>('FLUTTERWAVE_REDIRECT_URL');
  }

  /* ========================= Helpers ========================= */

  private authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.fwSecret}` };
  }

  private authHeaderByCurrency(currency?: string): Record<string, string> {
    const normalized = String(currency || '').toUpperCase();
    if (normalized === 'NGN') {
      const ngnSecret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY_NGN');
      if (ngnSecret) {
        return { Authorization: `Bearer ${ngnSecret}` };
      }
    }
    return this.authHeader();
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
    return (
      dtoRedirect ??
      (this.redirectDefault
        ? `${this.redirectDefault}/subscription/packages`
        : undefined)
    );
  }

  private normalizeKesMsisdnStrict(raw: string): string {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) {
      throw new HttpException(
        { message: 'Invalid KES mobile number: empty phone' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (digits.startsWith('254') && digits.length === 12) {
      return digits;
    }
    if (digits.startsWith('0') && digits.length === 10) {
      return `254${digits.slice(1)}`;
    }
    if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
      return `254${digits}`;
    }

    throw new HttpException(
      { message: 'Invalid KES mobile number format. Expected 254XXXXXXXXX' },
      HttpStatus.BAD_REQUEST,
    );
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
    // const txRef = this.generateTxRef();
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
  }

  // Hosted Payment (V3)
  async createPayin(dto: CreatePayinDto) {
    const txRef = dto.txRef ?? this.generateTxRef('txPayin');

    // KES payments are processed with Paystack (M-Pesa channel).
    if (String(dto.currency).toUpperCase() === 'KES') {
      return this.createKesMpesaPayin({ ...dto, txRef });
    }

    const payload = {
      tx_ref: txRef,
      amount: dto.amount,
      currency: dto.currency,
      redirect_url: this.buildRedirectUrl(dto.redirectUrl),
      customer: { email: dto.customerEmail, name: dto.customerName },
      meta: { app: 'digikuntz-payments', env: this.config.get('NODE_ENV') },
      payment_options: dto.channel ?? undefined,
    };

    const url = `${this.fwBaseUrlV3}/payments`;

    try {
      const resp = await this.fwPost(url, payload);
      const resData = resp.data;

      await this.payinModel.create({
        userId: dto.userId,
        transactionId: dto.transactionId,
        txRef,
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
      fullname: dto.customerName || dto.customerEmail,
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
        headers: this.authHeaderByCurrency(dto.currency),
        timeout: PayinService.HTTP_TIMEOUT_MS,
      }),
    );
    const resData = res.data;

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
    const amountKobo = Math.round(Number(dto.amount) * 100);
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
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

    const resData = await this.paystackService.chargeKesMobileMoney({
      email: dto.customerEmail,
      amountKobo,
      reference: dto.txRef,
      phone,
      provider,
      metadata: {
        flow: 'payment_request',
        customerName: dto.customerName ?? '',
        customerPhone: phone,
        app: 'digikuntz-payments',
      },
    });

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
      provider: PayinProvider.PAYSTACK,
      raw: resData,
    });

    return {
      status: PayinStatus.PENDING,
      transactionId: dto.transactionId,
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      provider: PayinProvider.PAYSTACK,
      details: resData?.data ?? resData,
      redirect_url: null,
    };
  }

  private mapPaystackStatusToLocal(status?: string): PayinStatus {
    console.log('Paystack Status for map: ', status);
    const normalized = String(status ?? '').toLowerCase();
    if (normalized === 'success') return PayinStatus.SUCCESSFUL;
    if (
      normalized === 'pending' ||
      normalized === 'abandoned' ||
      normalized === 'ongoing' ||
      normalized === 'processing' ||
      normalized === 'queued'
    ) {
      return PayinStatus.PENDING;
    }
    if (normalized === 'failed') return PayinStatus.FAILED;
    if (normalized === 'cancelled') return PayinStatus.CANCELLED;
    return PayinStatus.PENDING;
  }

  private async createKesMpesaPayin(dto: CreatePayinDto & { txRef: string }) {
    const amountKobo = Math.round(Number(dto.amount) * 100);
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
      throw new HttpException(
        { message: 'Invalid payment amount' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const callbackUrl =
      dto.redirectUrl || this.config.get<string>('PAYSTACK_CALLBACK_URL_KES');

    const resData = await this.paystackService.initializeKesMpesaPayment({
      email: dto.customerEmail,
      amountKobo,
      reference: dto.txRef,
      callbackUrl,
      metadata: {
        channel: 'mobile_money',
        provider: 'mpesa',
        customerName: dto.customerName ?? '',
        customerPhone: dto.customerPhone ?? '',
        app: 'digikuntz-payments',
      },
    });

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
      provider: PayinProvider.PAYSTACK,
      raw: resData,
    });

    return {
      status: PayinStatus.PENDING,
      transactionId: dto.transactionId,
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      redirect_url: resData?.data?.authorization_url,
    };
  }

  private async verifyPaystackByReference(reference: string) {
    // console.log('Reference Paystack verification: ', reference);
    const verifyResp = await this.paystackService.verifyTransaction(reference);
    // console.log('verifyPaystack By Reference raw: ', verifyResp);
    // console.log('verifyPaystack By Reference: ', verifyResp.data);
    const providerStatus = verifyResp?.data?.status;
    const status = this.mapPaystackStatusToLocal(providerStatus);

    const updated = await this.payinModel
      .findOneAndUpdate(
        { txRef: reference },
        {
          status,
          provider: PayinProvider.PAYSTACK,
          raw: verifyResp,
        },
        { new: true },
      )
      .lean()
      .exec();

    return updated;
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
        { txRef },
        {
          status,
          flwTxId: String(flwId ?? ''),
          raw: data,
        },
        { new: true },
      )
      .exec();

    return updated;
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
          { txRef },
          {
            status,
            raw: data,
            flwTxId: (data?.data as FWVerifyByRefData)?.id,
          },
          { new: true },
        )
        .exec();

      this.logger.log(
        `Payin ${txRef} updated to status=${status} (flwId=${(data?.data as FWVerifyByRefData)?.id})`,
      );
      return updated;
    } catch (error: unknown) {
      const { fwData, message } = this.unwrapAxiosError(error);

      this.logger.error(`Error verifying tx ${txRef}: ${message}`, fwData ?? '');
      await this.payinModel
        .findOneAndUpdate(
          { txRef },
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

  async findPending(limit = 1000) {
    return this.payinModel
      .find({ status: PayinStatus.PENDING })
      .limit(limit)
      .exec();
  }

  hasExpiredInMinutes(inputDate: string | Date, duration: number = 15): boolean {
    const target = new Date(inputDate).getTime();
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
  async verifyPayin(idOrTxRef: string, saveLocal = false) {
    const localAnyRef = await this.payinModel
      .findOne({ $or: [{ txRef: idOrTxRef }, { flwTxId: String(idOrTxRef) }] })
      .lean()
      .exec();

    if (localAnyRef?.provider === PayinProvider.PAYSTACK) {
      return this.verifyPaystackByReference(String(localAnyRef.txRef));
    }

    // console.log('verifyPayin: idOrTxRef', idOrTxRef);
    try {
      let resp;
      if (/^\d+$/.test(idOrTxRef)) {
        // this.logger.debug(`verifyPayin: idOrTxRef is numeric: ${idOrTxRef}`);
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

      // Mise à jour générique locale -> FAILED (si existe)
      await this.payinModel
        .findOneAndUpdate(
          { txRef: idOrTxRef },
          { status: PayinStatus.FAILED, error: fwData ?? message },
          { new: true },
        )
        .exec();

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

  /**
   * Webhook verification using configured secret hash
   */
  async verifyWebhook(req: Request & { body?: any; headers?: any }) {
    const signature = (req.headers as any)['verif-hash'] as string | undefined;
    const body = req.body ?? {};

    if (!signature || signature !== this.secretHash) {
      this.logger.warn('Invalid Flutterwave webhook signature');
      throw new UnauthorizedException('Invalid Flutterwave webhook signature');
    }

    // Exemple : mettre à jour si charge.completed + successful
    if (body.event === 'charge.completed' && body.data?.status === 'successful') {
      await this.payinModel
        .findOneAndUpdate(
          { flwTxId: body.data.id },
          { status: PayinStatus.SUCCESSFUL },
          { new: true },
        )
        .exec();
    }

    return { status: 'ok' };
  }

  async getAllPayinTransactoins(query: Query): Promise<any[]> {
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          title: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};
    const transactions = await this.payinModel
      .find({ ...keyword })
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
