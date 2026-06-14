/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */ /* eslint-disable @typescript-eslint/no-unsafe-call */ /* eslint-disable @typescript-eslint/no-unsafe-return */ /* eslint-disable @typescript-eslint/no-unsafe-assignment */ /* eslint-disable @typescript-eslint/no-unsafe-member-access */ /* eslint-disable prettier/prettier */

import {
  Inject,
  forwardRef,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import { HttpService } from '@nestjs/axios';

import {
  Payout,
  PayoutDocument,
  PayoutProvider,
  PayoutStatus,
} from './payout.schema';
import { ConfigService } from '@nestjs/config';
import { TStatus } from 'src/transaction/transaction.schema';
import { TransactionService } from 'src/transaction/transaction.service';
import { randomBytes } from 'crypto';
import { EmailService } from 'src/email/email.service';
import { OperationNotificationService } from 'src/notification/operation-notification.service';
import { MpesaService } from 'src/mpesa/mpesa.service';

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);
  private fwSecret: any;
  private fwSecretNGN: any;
  private fwBaseUrlV3 = 'https://api.flutterwave.com/v3';

  private normalizeKenyanMsisdn(input?: string): string {
    const digits = String(input || '').replace(/\D/g, '');
    if (!digits) return '';
    return /^2547\d{8}$/.test(digits) ? digits : '';
  }

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly mpesaService: MpesaService,
    @InjectModel(Payout.name)
    private readonly payoutModel: mongoose.Model<PayoutDocument>,
    @Inject(forwardRef(() => TransactionService))
    private transactionService: TransactionService,
    private emailService: EmailService,
    private operationNotificationService: OperationNotificationService,
  ) {
    this.fwSecret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
    this.fwSecretNGN = this.config.get<string>('FLUTTERWAVE_SECRET_KEY_NGN');
  }

  private normalizeMpesaPayoutStatus(raw?: any): string {
    const resultCode = Number(raw?.ResultCode ?? raw?.Result?.ResultCode);
    if (resultCode === 0) return PayoutStatus.SUCCESSFUL;
    if ([1, 1032, 2001, 1025, 1037].includes(resultCode))
      return PayoutStatus.FAILED;
    return PayoutStatus.PROCESSING;
  }

  private isInsufficientPayoutBalance(details: any): boolean {
    const code = String(details?.code || '').toLowerCase();
    const type = String(details?.type || '').toLowerCase();
    const message = String(details?.message || details || '').toLowerCase();

    return (
      code.includes('insufficient_balance') ||
      message.includes('insufficient balance') ||
      message.includes('balance is not enough') ||
      (type === 'api_error' && message.includes('balance'))
    );
  }

  private isThirdPartyPayoutBlocked(details: any): boolean {
    const code = String(details?.code || '').toLowerCase();
    const type = String(details?.type || '').toLowerCase();
    const message = String(details?.message || details || '').toLowerCase();

    return (
      message.includes('third party payouts') ||
      message.includes('cannot initiate third party payouts') ||
      code.includes('third_party') ||
      (type === 'api_error' && message.includes('try again later'))
    );
  }

  private buildPayoutCapabilityException(
    provider: 'paystack' | 'flutterwave',
    details: any,
    context?: Record<string, any>,
  ): HttpException {
    return new HttpException(
      {
        message: 'Payout is temporarily unavailable for this account',
        code: 'PAYOUT_TEMPORARILY_UNAVAILABLE',
        provider,
        details,
        ...(context ? { context } : {}),
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private buildInsufficientBalanceException(
    provider: 'paystack' | 'flutterwave',
    details: any,
    context?: Record<string, any>,
  ): HttpException {
    return new HttpException(
      {
        message: 'Insufficient payout balance',
        code: 'INSUFFICIENT_PAYOUT_BALANCE',
        provider,
        details,
        ...(context ? { context } : {}),
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  async createPayout(
    payloadPayout,
    providerData,
    provider: PayoutProvider = PayoutProvider.FLUTTERWAVE,
  ) {
    const status =
      provider === PayoutProvider.PAYSTACK || provider === PayoutProvider.MPESA
        ? this.normalizeMpesaPayoutStatus(providerData)
        : this.normalizeStatus(providerData?.data?.data?.status);

    const created = await this.payoutModel.create({
      reference: payloadPayout.reference,
      txRef: payloadPayout.txRef,
      transactionId: payloadPayout.transactionId,
      userId: payloadPayout.userId,
      provider,
      type: payloadPayout.type, // 'bank' | 'mobile_money' | 'wallet'
      amount: payloadPayout.amount,
      sourceCurrency: payloadPayout.sourceCurrency,
      destinationCurrency: payloadPayout.destinationCurrency,
      accountBankCode: payloadPayout.accountBankCode,
      accountNumber: payloadPayout.accountNumber,
      narration: this.toAlphanumeric(payloadPayout.narration),
      status,
      raw: providerData,
    });

    // Always return a plain JSON object (avoid circular Mongoose internals in downstream raw saves)
    return created?.toObject?.() ?? created;
  }

  /**
   * Normalisation des statuts V3
   */
  private normalizeStatus(status: string): string {
    // const map: Record<string, string> = {
    //   NEW: 'PROCESSING',
    //   PENDING: 'PROCESSING',
    //   QUEUED: 'PROCESSING',
    //   SUCCESSFUL: 'SUCCESSFUL',
    //   FAILED: 'FAILED',
    // };
    // return map[status] || 'UNKNOWN';
    if (status === 'SUCCESSFUL') {
      return PayoutStatus.SUCCESSFUL;
    } else if (status === 'FAILED') {
      return PayoutStatus.FAILED;
    } else return PayoutStatus.PROCESSING;
  }

  async getPayout(reference: string) {
    return this.payoutModel.findOne({ reference }).lean().exec();
  }

  async getPayoutById(payoutId: string) {
    return this.payoutModel.findById({ payoutId }).lean().exec();
  }

  async getPayoutByTransactionId(transactionId: string) {
    return this.payoutModel.find({ transactionId }).lean().exec();
  }

  private async updateLocalByRef(
    reference: string,
    update: Partial<Payout & { raw?: unknown }>,
    options: { lean?: boolean; new?: boolean } = {},
  ) {
    const res = await this.payoutModel
      .findOneAndUpdate({ reference }, update, { new: !!options.new })
      .exec();
    return options.lean ? res?.toObject?.() : res;
  }

  async getPayoutStatus(reference: string) {
    const data = await this.payoutModel.findOne({ reference }).lean().exec();
    if (!data) {
      throw new HttpException(
        { message: `Transaction ${reference} not found` },
        HttpStatus.NOT_FOUND,
      );
    }
    return { status: data.status };
  }

  async findPending(limit = 1000) {
    return this.payoutModel
      .find({ status: PayoutStatus.PROCESSING })
      .limit(limit)
      .exec();
  }

  isMoreThan8HoursAhead(inputDate: string | Date): boolean {
    const target = new Date(inputDate).getTime();
    const now = Date.now();
    const diff = now - target;
    return diff > 8 * 60 * 60 * 1000; // true if the date given as a parameter is more than 8 hours before the current date
  }

  async updatePayoutStatus(reference: string, status: string) {
    return this.payoutModel
      .findOneAndUpdate({ reference }, { status }, { new: true })
      .exec();
  }

  async updatePayout(data: any) {
    const reference = data.reference;
    if (!reference)
      throw new HttpException(
        { message: 'reference is required' },
        HttpStatus.BAD_REQUEST,
      );
    return this.payoutModel
      .findOneAndUpdate(
        { reference },
        { status: data.status, raw: data, updatedAt: new Date() },
        { new: true },
      )
      .exec();
  }

  async verifyPayout(reference: string, updateOnPending: boolean = false) {
    const localPayout: any = await this.payoutModel
      .findOne({ reference })
      .lean()
      .exec();
    if (!localPayout) {
      throw new NotFoundException('Payout not found');
    }

    if (
      localPayout.provider === PayoutProvider.PAYSTACK ||
      localPayout.provider === PayoutProvider.MPESA
    ) {
      return this.verifyPaystackPayout(reference, updateOnPending);
    }

    const oldStatus = localPayout.status;

    const url = `${this.fwBaseUrlV3}/transfers?reference=${reference}`;
    const res: any = await this.http
      .get(url, {
        headers: { Authorization: `Bearer ${this.fwSecret}` },
      })
      .toPromise();

    if (res.data && res.data.data && res.data.data.length > 0) {
      const payout = res.data.data[0];
      console.log('payout from FW', payout);

      if (oldStatus !== payout.status) {
        const updatedPayout = await this.updatePayout(payout);

        if (!updatedPayout) {
          throw new NotFoundException('payout not found');
        }

        if (payout.status === 'SUCCESSFUL') {
          console.log('updating transaction: ', updatedPayout.transactionId.toString());
          const transaction =
            await this.transactionService.updateTransactionStatus(
              updatedPayout.transactionId.toString(),
              TStatus.PAYOUTSUCCESS,
              payout,
            );
          console.log('transaction SUCCESSFUL', transaction);
          // send Email payment success
          if (transaction.transactionType === 'transfer') {
            void this.operationNotificationService.notifyTransferSuccess(transaction);
          } else if (transaction.transactionType === 'withdrawal') {
            void this.operationNotificationService.notifyWithdrawalSuccess(transaction);
          }
          console.log('verify payout and update SUCCESS')
        }
        if (payout.status === 'FAILED') {
          const transaction =
            await this.transactionService.updateTransactionStatus(
              updatedPayout.transactionId.toString(),
              TStatus.PAYOUTERROR,
              payout
            );
          console.log('transaction FAILED', transaction);
          void this.operationNotificationService.notifyAdminPayoutFailed(transaction);
        }
        if (payout.status === 'PENDING' && updateOnPending === true) {
          const transaction =
            await this.transactionService.updateTransactionStatus(
              reference,
              TStatus.PAYOUTPENDING,
              payout
            );
          if (
            transaction &&
            (transaction.transactionType === 'transfer' ||
              transaction.transactionType === 'withdrawal' ||
              transaction.isApiPayout === true)
          ) {
            void this.operationNotificationService.notifyAdminPayoutPending(transaction);
          }
        }
      }
      return payout;
    }
    throw new NotFoundException('Payout not found on Flutterwave');
  }

  async initiateMpesaPayout(
    transaction: any,
    userId: string,
    reference: string,
  ) {
    const normalizedPrimary = this.normalizeKenyanMsisdn(
      String(
        transaction?.bankAccountNumber ||
          transaction?.receiverMobileAccountNumber ||
          transaction?.receiverContact ||
          transaction?.senderContact ||
          '',
      ),
    );
    if (!normalizedPrimary) {
      throw new HttpException(
        {
          message:
            'Invalid recipient mobile account number for M-Pesa payout. Expected 2547XXXXXXXX (example: 254701234567)',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const amount = Number(transaction?.receiverAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { message: 'Invalid payout amount' },
        HttpStatus.BAD_REQUEST,
      );
    }

    let transfer: any;
    try {
      transfer = await this.mpesaService.initiateB2CPayout({
        phone: normalizedPrimary,
        amount,
        reference,
        remarks: this.toAlphanumeric(transaction?.raisonForTransfer || 'Payout'),
        occasion: reference,
      });
    } catch (error: any) {
      const upstreamDetails =
        typeof error?.getResponse === 'function'
          ? error.getResponse()
          : error?.response?.data || error?.message || error;
      const upstreamStatus =
        typeof error?.getStatus === 'function'
          ? Number(error.getStatus())
          : HttpStatus.BAD_GATEWAY;
      const safeStatus =
        Number.isInteger(upstreamStatus) &&
        upstreamStatus >= 400 &&
        upstreamStatus <= 599
          ? upstreamStatus
          : HttpStatus.BAD_GATEWAY;

      this.logger.error(
        `[M-Pesa payout] initiation failed | ref=${reference} | msisdn=${normalizedPrimary} | amount=${amount} | details=${JSON.stringify(upstreamDetails)}`,
      );
      void this.operationNotificationService
        .notifyAdminPayoutFailed(transaction)
        .catch(() => undefined);
      throw new HttpException(
        {
          message: 'M-Pesa payout initiation failed',
          details: upstreamDetails,
          context: {
            reference,
            normalizedMsisdn: normalizedPrimary,
            amount,
          },
        },
        safeStatus,
      );
    }

    const payloadPayout = {
      reference,
      txRef: transaction?.txRef || reference,
      transactionId: String(transaction?._id),
      userId,
      type: 'mobile_money',
      amount: Number(transaction?.receiverAmount),
      sourceCurrency: transaction?.receiverCurrency,
      destinationCurrency: transaction?.receiverCurrency,
      accountBankCode: 'MPESA',
      accountNumber: normalizedPrimary,
      narration: transaction?.raisonForTransfer || 'Payout',
    };

    const saved = await this.createPayout(
      payloadPayout,
      transfer,
      PayoutProvider.MPESA,
    );

    await this.transactionService.updateTransactionStatus(
      String(transaction._id),
      TStatus.PAYOUTPENDING,
      saved?.toObject?.() ? saved.toObject() : saved,
    );
    await this.transactionService.updateTransactionTxRef(
      String(transaction._id),
      reference,
    );

    return saved;
  }

  // Backward compatibility for existing internal calls.
  async initiatePaystackPayout(
    transaction: any,
    userId: string,
    reference: string,
  ) {
    return this.initiateMpesaPayout(transaction, userId, reference);
  }

  async verifyPaystackPayout(reference: string, updateOnPending: boolean = false) {
    const existing: any = await this.payoutModel.findOne({ reference }).lean().exec();
    if (!existing) {
      throw new NotFoundException('Payout not found');
    }
    const providerPayload = existing?.raw || {};
    const nextStatus = this.normalizeMpesaPayoutStatus(providerPayload);
    const oldStatus = existing.status;

    if (oldStatus !== nextStatus) {
      await this.updatePayout({
        reference,
        status: nextStatus,
        ...providerPayload,
      });
    }

    if (nextStatus === PayoutStatus.SUCCESSFUL && oldStatus !== PayoutStatus.SUCCESSFUL) {
      const transaction = await this.transactionService.updateTransactionStatus(
        String(existing.transactionId),
        TStatus.PAYOUTSUCCESS,
        providerPayload,
      );
      if (transaction.transactionType === 'transfer') {
        void this.operationNotificationService.notifyTransferSuccess(transaction);
      } else if (transaction.transactionType === 'withdrawal') {
        void this.operationNotificationService.notifyWithdrawalSuccess(transaction);
      }
    }

    if (nextStatus === PayoutStatus.FAILED && oldStatus !== PayoutStatus.FAILED) {
      const transaction = await this.transactionService.updateTransactionStatus(
        String(existing.transactionId),
        TStatus.PAYOUTERROR,
        providerPayload,
      );
      void this.operationNotificationService.notifyAdminPayoutFailed(transaction);
    }

    if (
      nextStatus === PayoutStatus.PROCESSING &&
      updateOnPending === true
    ) {
      await this.transactionService.updateTransactionStatus(
        String(existing.transactionId),
        TStatus.PAYOUTPENDING,
        providerPayload,
      );
    }

    return providerPayload;
  }

  async handleMpesaB2CResult(payload: any) {
    console.log('callback B2C result: ', payload)
    const result = payload?.Result || payload?.Body?.Result || payload || {};
    const conversationId = String(result?.ConversationID || '');
    const originatorConversationId = String(
      result?.OriginatorConversationID || '',
    );
    const referenceCandidates = [conversationId, originatorConversationId].filter(
      Boolean,
    );
    if (!referenceCandidates.length) {
      return { success: false, message: 'Missing conversation identifiers' };
    }

    const payout: any = await this.payoutModel
      .findOne({
        $or: [
          { reference: { $in: referenceCandidates } },
          { 'raw.ConversationID': { $in: referenceCandidates } },
          { 'raw.OriginatorConversationID': { $in: referenceCandidates } },
        ],
      })
      .lean()
      .exec();

    if (!payout) {
      return {
        success: false,
        message: 'Payout not found for callback',
        context: { referenceCandidates },
      };
    }

    const nextStatus = this.normalizeMpesaPayoutStatus(result);
    await this.updatePayout({
      reference: payout.reference,
      status: nextStatus,
      ...result,
    });

    if (nextStatus === PayoutStatus.SUCCESSFUL) {
      const transaction = await this.transactionService.updateTransactionStatus(
        String(payout.transactionId),
        TStatus.PAYOUTSUCCESS,
        result,
      );
      if (transaction.transactionType === 'transfer') {
        void this.operationNotificationService.notifyTransferSuccess(transaction);
      } else if (transaction.transactionType === 'withdrawal') {
        void this.operationNotificationService.notifyWithdrawalSuccess(transaction);
      }
    } else if (nextStatus === PayoutStatus.FAILED) {
      const transaction = await this.transactionService.updateTransactionStatus(
        String(payout.transactionId),
        TStatus.PAYOUTERROR,
        result,
      );
      void this.operationNotificationService.notifyAdminPayoutFailed(transaction);
    } else {
      await this.transactionService.updateTransactionStatus(
        String(payout.transactionId),
        TStatus.PAYOUTPENDING,
        result,
      );
    }

    return { success: true, reference: payout.reference, status: nextStatus };
  }

  async handleMpesaB2CTimeout(payload: any) {
    const result = payload?.Result || payload || {};
    const conversationId = String(
      result?.ConversationID || result?.OriginatorConversationID || '',
    );
    if (!conversationId) {
      return { success: false, message: 'Missing conversation id' };
    }
    const payout: any = await this.payoutModel
      .findOne({
        $or: [
          { reference: conversationId },
          { 'raw.ConversationID': conversationId },
          { 'raw.OriginatorConversationID': conversationId },
        ],
      })
      .lean()
      .exec();

    if (!payout) {
      return { success: false, message: 'Payout not found for timeout' };
    }

    await this.updatePayout({
      reference: payout.reference,
      status: PayoutStatus.FAILED,
      ...result,
    });
    const transaction = await this.transactionService.updateTransactionStatus(
      String(payout.transactionId),
      TStatus.PAYOUTERROR,
      result,
    );
    void this.operationNotificationService.notifyAdminPayoutFailed(transaction);
    return { success: true, reference: payout.reference, status: PayoutStatus.FAILED };
  }

  async retryPayout(reference: string) {
    // 1) Fetch existing payout and validate state
    const existing: any = await this.payoutModel.findOne({ reference }).lean().exec();
    if (!existing) {
      throw new NotFoundException('Payout not found for this reference');
    }
    if (existing.status !== PayoutStatus.FAILED) {
      throw new HttpException(
        { message: 'Only FAILED payouts can be retried' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2) Load related transaction to enrich FW payload
    if (!existing.transactionId) {
      throw new NotFoundException('Linked transaction not found');
    }
    const transactionIdStr = existing.transactionId.toString();
    const transaction = await this.transactionService.findById(transactionIdStr);

    // 3) Build new reference and payloads
    const newReference = `${reference}-retry-${Date.now()}`;
    const payloadPayout = {
      reference: newReference,
      transactionId: existing.transactionId,
      userId: existing.userId,
      type: existing.type,
      amount: existing.amount,
      sourceCurrency: existing.sourceCurrency,
      destinationCurrency: existing.destinationCurrency,
      accountBankCode: existing.accountBankCode,
      accountNumber: existing.accountNumber,
      narration: this.toAlphanumeric(existing.narration ?? 'Payout retry'),
    };

    const fwPayload: any = {
      account_bank: payloadPayout.accountBankCode,
      account_number: payloadPayout.accountNumber,
      amount: payloadPayout.amount,
      currency: payloadPayout.destinationCurrency,
      reference: payloadPayout.reference,
      narration: payloadPayout.narration,
      debit_currency: payloadPayout.sourceCurrency,
      beneficiary_name: this.normalizeProviderFullName(
        transaction?.receiverName,
        'receiverName',
      ),
      meta: [
        {
          beneficiary_country: transaction?.receiverCountryCode,
          sender: this.normalizeProviderFullName(
            transaction?.senderName,
            'senderName',
          ),
          sender_address: transaction?.senderCountry,
          sender_country: transaction?.senderCountry,
          sender_mobile_number: transaction?.senderContact,
        },
      ],
    };

    // 4) Call Flutterwave transfers endpoint
    const url = `${this.fwBaseUrlV3}/transfers`;
    const res: any = await this.http
      .post(url, fwPayload, {
        headers: { Authorization: `Bearer ${this.fwSecret}` },
      })
      .toPromise();

    // 5) Save new payout record and update transaction status
    const saved = await this.createPayout(payloadPayout, res.data);
    await this.transactionService.updateTransactionStatus(
      transactionIdStr,
      TStatus.PAYOUTPENDING,
      saved,
    );
    const update = await this.transactionService.updateTransactionTxRef(
      transactionIdStr,
      newReference,
    );

    return { reference: newReference, saved, fw: res?.data };
  }

  async getTotalTransaction(): Promise<number> {
    return await this.payoutModel.countDocuments();
  }

  async getTotalTransactionOfUser(userId: string): Promise<number> {
    return await this.payoutModel.countDocuments({ userId });
  }

  generateTxRef(prefix = 'tx'): string {
    return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  async sendWithdrawalConfirmationEmail(userData, transactionData): Promise<any> {
    return await this.emailService.sendWithdrawalConfirmationEmail(userData, transactionData);
  }

  /**
   * Convert a text to alphanumeric
   * @param {string} text - the sentence in param
   * @returns {string} - Cleared sentence
   */
  toAlphanumeric(text) {
    if (typeof text !== 'string') return '';

    return text
      // 1. Supprimer les accents et normaliser
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // retire les diacritiques
      // 2. Remplacer les caractères non alphanumériques par rien
      .replace(/[^a-zA-Z0-9]/g, '')
      // 3. Supprimer les espaces (facultatif selon besoin)
      .trim();
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
}
