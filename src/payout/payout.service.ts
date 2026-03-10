/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */ /* eslint-disable @typescript-eslint/no-unsafe-call */ /* eslint-disable @typescript-eslint/no-unsafe-return */ /* eslint-disable @typescript-eslint/no-unsafe-assignment */ /* eslint-disable @typescript-eslint/no-unsafe-member-access */ /* eslint-disable prettier/prettier */

import {
  Injectable,
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
import { PaystackService } from 'src/paystack/paystack.service';

@Injectable()
export class PayoutService {
  private fwSecret: any;
  private fwSecretNGN: any;
  private fwBaseUrlV3 = 'https://api.flutterwave.com/v3';

  private normalizeKenyanMsisdn(input?: string): string {
    const digits = String(input || '').replace(/\D/g, '');
    if (!digits) return '';

    // 2540XXXXXXXXX -> 2547XXXXXXXX (remove trunk 0 after country code)
    if (digits.length === 13 && digits.startsWith('2540')) {
      return `254${digits.slice(4)}`;
    }
    // 07XXXXXXXX -> 2547XXXXXXXX
    if (digits.length === 10 && digits.startsWith('0')) {
      return `254${digits.slice(1)}`;
    }
    // 7XXXXXXXX -> 2547XXXXXXXX
    if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
      return `254${digits}`;
    }
    // 2547XXXXXXXX already normalized
    return digits;
  }

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly paystackService: PaystackService,
    @InjectModel(Payout.name)
    private readonly payoutModel: mongoose.Model<PayoutDocument>,
    private transactionService: TransactionService,
    private emailService: EmailService,
    private operationNotificationService: OperationNotificationService,
  ) {
    this.fwSecret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
    this.fwSecretNGN = this.config.get<string>('FLUTTERWAVE_SECRET_KEY_NGN');
  }

  private normalizePaystackStatus(status?: string): string {
    const normalized = String(status ?? '').toLowerCase();
    if (normalized === 'success') return PayoutStatus.SUCCESSFUL;
    if (normalized === 'failed' || normalized === 'reversed')
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
      provider === PayoutProvider.PAYSTACK
        ? this.normalizePaystackStatus(providerData?.data?.status)
        : this.normalizeStatus(providerData?.data?.data?.status);

    return await this.payoutModel.create({
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
    })
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

    if (localPayout.provider === PayoutProvider.PAYSTACK) {
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
              reference,
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
        }
      }
      return payout;
    }
    throw new NotFoundException('Payout not found on Flutterwave');
  }

  async initiatePaystackPayout(
    transaction: any,
    userId: string,
    reference: string,
  ) {
    const rawCandidates = [
      transaction?.bankAccountNumber,
      transaction?.receiverMobileAccountNumber,
      transaction?.receiverContact,
      transaction?.senderContact,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    const normalizedPrimary = this.normalizeKenyanMsisdn(rawCandidates[0] || '');
    if (!normalizedPrimary) {
      throw new HttpException(
        { message: 'Missing recipient mobile account number for Paystack payout' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const accountCandidates = Array.from(
      new Set(
        rawCandidates.flatMap((value) => {
          const digits = value.replace(/\D/g, '');
          const normalized = this.normalizeKenyanMsisdn(value);
          const variants = [normalized, digits];
          if (normalized.startsWith('254')) {
            variants.push(`0${normalized.slice(3)}`);
            variants.push(normalized.slice(3));
          }
          return variants.filter(Boolean);
        }),
      ),
    );

    const amount = Number(transaction?.receiverAmount);
    const amountSmallestUnit = Math.round(amount * 100);
    if (!Number.isFinite(amountSmallestUnit) || amountSmallestUnit <= 0) {
      throw new HttpException(
        { message: 'Invalid payout amount' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const configuredBankCode = this.config.get<string>('PAYSTACK_MPESA_BANK_CODE');
    const resolvedBankCode =
      await this.paystackService.resolveKesMpesaBankCode(configuredBankCode);
    const bankCodeCandidates = Array.from(
      new Set(
        [
          configuredBankCode,
          transaction?.bankCode,
          resolvedBankCode,
          'MPESA',
          'MPS',
        ]
          .map((value) => String(value || '').trim().toUpperCase())
          .filter(Boolean),
      ),
    );

    let recipient: any;
    let transfer: any;
    let selectedBankCode = resolvedBankCode;
    let selectedAccountNumber = normalizedPrimary;
    const attempts: Array<Record<string, any>> = [];
    try {
      for (const bankCode of bankCodeCandidates) {
        for (const accountNumber of accountCandidates) {
          try {
            recipient = await this.paystackService.createKesMpesaTransferRecipient({
              name: transaction?.receiverName || 'Recipient',
              accountNumber,
              bankCode,
              description: this.toAlphanumeric(
                transaction?.raisonForTransfer || 'Payout',
              ),
            });

            const recipientCode = recipient?.data?.recipient_code;
            if (!recipientCode) {
              attempts.push({
                bankCode,
                accountNumber,
                error: recipient,
              });
              continue;
            }

            selectedBankCode = bankCode;
            selectedAccountNumber = accountNumber;
            transfer = await this.paystackService.initiateKesPayout({
              recipientCode,
              amountSmallestUnit,
              reference,
              reason: transaction?.raisonForTransfer || 'Payout',
            });
            break;
          } catch (innerError: any) {
            const innerDetails =
              innerError?.response?.data || innerError?.message || innerError;
            const innerCode = String(innerDetails?.code || '').toLowerCase();
            const innerType = String(innerDetails?.type || '').toLowerCase();
            attempts.push({
              bankCode,
              accountNumber,
              error: innerDetails,
            });

            // Stop retry loop for business errors that won't be fixed by trying another format.
            if (
              innerCode === 'insufficient_balance' ||
              innerCode === 'transfer_creation_error' ||
              innerCode === 'api_error' ||
              innerType === 'api_error'
            ) {
              if (this.isInsufficientPayoutBalance(innerDetails)) {
                throw this.buildInsufficientBalanceException(
                  'paystack',
                  innerDetails,
                );
              }
              if (this.isThirdPartyPayoutBlocked(innerDetails)) {
                throw this.buildPayoutCapabilityException(
                  'paystack',
                  innerDetails,
                );
              }
              throw new HttpException(
                {
                  message: 'Paystack payout blocked',
                  details: innerDetails,
                },
                HttpStatus.BAD_GATEWAY,
              );
            }
          }
        }
        if (transfer) break;
      }

      if (!transfer) {
        throw new HttpException(
          {
            message: 'Unable to create Paystack transfer recipient',
            details: attempts[attempts.length - 1] || recipient,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      const details = error?.response?.data || error?.message || error;
      if (this.isInsufficientPayoutBalance(details)) {
        throw this.buildInsufficientBalanceException('paystack', details, {
          reference,
          bankCode: selectedBankCode,
          normalizedMsisdn: selectedAccountNumber,
          amountSmallestUnit,
          attempts,
        });
      }
      if (this.isThirdPartyPayoutBlocked(details)) {
        throw this.buildPayoutCapabilityException('paystack', details, {
          reference,
          bankCode: selectedBankCode,
          normalizedMsisdn: selectedAccountNumber,
          amountSmallestUnit,
          attempts,
        });
      }
      throw new HttpException(
        {
          message: 'Paystack payout initiation failed',
          details,
          context: {
            reference,
            bankCode: selectedBankCode,
            normalizedMsisdn: selectedAccountNumber,
            amountSmallestUnit,
            attempts,
          },
        },
        HttpStatus.BAD_GATEWAY,
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
      accountBankCode: selectedBankCode,
      accountNumber: selectedAccountNumber,
      narration: transaction?.raisonForTransfer || 'Payout',
    };

    const saved = await this.createPayout(
      payloadPayout,
      transfer,
      PayoutProvider.PAYSTACK,
    );

    await this.transactionService.updateTransactionStatus(
      String(transaction._id),
      TStatus.PAYOUTPENDING,
      saved,
    );
    await this.transactionService.updateTransactionTxRef(
      String(transaction._id),
      reference,
    );

    return saved;
  }

  async verifyPaystackPayout(reference: string, updateOnPending: boolean = false) {
    const existing: any = await this.payoutModel.findOne({ reference }).lean().exec();
    if (!existing) {
      throw new NotFoundException('Payout not found');
    }

    const paystackPayout = await this.paystackService.fetchTransferByReference(reference);
    if (!paystackPayout) {
      throw new NotFoundException('Payout not found on Paystack');
    }

    const nextStatus = this.normalizePaystackStatus(paystackPayout?.status);
    const oldStatus = existing.status;

    if (oldStatus !== nextStatus) {
      await this.updatePayout({
        reference,
        status: nextStatus,
        ...paystackPayout,
      });
    }

    if (nextStatus === PayoutStatus.SUCCESSFUL && oldStatus !== PayoutStatus.SUCCESSFUL) {
      const transaction = await this.transactionService.updateTransactionStatus(
        String(existing.transactionId),
        TStatus.PAYOUTSUCCESS,
        paystackPayout,
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
        paystackPayout,
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
        paystackPayout,
      );
    }

    return paystackPayout;
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
      beneficiary_name: transaction?.receiverName,
      meta: [
        {
          beneficiary_country: transaction?.receiverCountryCode,
          sender: transaction?.senderName,
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
    const saved = await this.createPayout(payloadPayout, res);
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
}
