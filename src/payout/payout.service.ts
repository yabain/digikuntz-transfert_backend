/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */ /* eslint-disable @typescript-eslint/no-unsafe-call */ /* eslint-disable @typescript-eslint/no-unsafe-return */ /* eslint-disable @typescript-eslint/no-unsafe-assignment */ /* eslint-disable @typescript-eslint/no-unsafe-member-access */ /* eslint-disable prettier/prettier */

import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import { HttpService } from '@nestjs/axios';

import { Payout, PayoutDocument, PayoutStatus } from './payout.schema';
import { ConfigService } from '@nestjs/config';
import { TStatus } from 'src/transaction/transaction.schema';
import { TransactionService } from 'src/transaction/transaction.service';
import { randomBytes } from 'crypto';
import { WhatsappService } from 'src/wa/whatsapp.service';
import { EmailService } from 'src/email/email.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class PayoutService {
  private fwSecret: any;
  private fwSecretNGN: any;
  private fwBaseUrlV3 = 'https://api.flutterwave.com/v3';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectModel(Payout.name)
    private readonly payoutModel: mongoose.Model<PayoutDocument>,
    private transactionService: TransactionService,
    @Inject(forwardRef(() => WhatsappService))
    private whatsappService: WhatsappService,
    private emailService: EmailService,
    private userService: UserService
  ) {
    this.fwSecret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
    this.fwSecretNGN = this.config.get<string>('FLUTTERWAVE_SECRET_KEY_NGN');
  }

  async createPayout(payloadPayout, fwData) {
    return await this.payoutModel.create({
      reference: payloadPayout.reference,
      txRef: payloadPayout.txRef,
      transactionId: payloadPayout.transactionId,
      userId: payloadPayout.userId,
      type: payloadPayout.type, // 'bank' | 'mobile_money' | 'wallet'
      amount: payloadPayout.amount,
      sourceCurrency: payloadPayout.sourceCurrency,
      destinationCurrency: payloadPayout.destinationCurrency,
      accountBankCode: payloadPayout.accountBankCode,
      accountNumber: payloadPayout.accountNumber,
      narration: this.toAlphanumeric(payloadPayout.narration),
      status: this.normalizeStatus(fwData.data?.data?.status),
      raw: fwData.data,
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

  async verifyPayout(reference: string) {
    const oldStatus = 'PENDING';

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
          const transaction =
            await this.transactionService.updateTransactionStatus(
              reference,
              TStatus.PAYOUTSUCCESS,
              payout,
            );
          console.log('transaction SUCCESSFUL', transaction);
          // send Email payment success
          if (transaction.transactionType === 'transfer') {
            this.whatsappService.sendMessageForTransferReceiver(transaction);
            this.whatsappService.sendMessageForTransferSender(transaction);
          } else if (transaction.transactionType === 'withdrawal') {
            this.whatsappService.sendWithdrawalMessage(transaction);
            const userData = await this.userService.getUserById(transaction.receiverId)
            this.sendWithdrawalConfirmationEmail(userData, transaction);
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
          // send Email payment failed to admin
          // Send Whatsapp to admin
        }
      }
      return payout;
    }
    throw new NotFoundException('Payout not found on Flutterwave');
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
