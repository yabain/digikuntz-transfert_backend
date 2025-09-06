/* eslint-disable no-empty */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Payin, PayinDocument } from 'src/payin/payin.schema';
import { CreatePayinDto, VerifyPayinDto } from 'src/payin/payin.dto';
import { Payout, PayoutDocument } from 'src/payout/payout.schema';
import { CreatePayoutDto } from 'src/payout/payout.dto';
import { PayinService } from 'src/payin/payin.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { ExceptionsHandler } from '@nestjs/core/exceptions/exceptions-handler';
import { TStatus } from 'src/transaction/transaction.schema';

@Injectable()
export class FlutterwaveService {
  private fwSecret: any;
  private fwPublic: any;
  private fwBaseUrlV3 = 'https://api.flutterwave.com/v3';
  // Some V4 payout endpoints (subject to account enablement)
  private fwBaseUrlV4 = 'https://api.flutterwave.cloud';
  private secretHash: any;
  private tStatus: any = TStatus;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectModel(Payout.name) private payoutModel: Model<PayoutDocument>,
    private payinService: PayinService,
    private transactionService: TransactionService,
  ) {
    this.secretHash = this.config.get<string>('FLUTTERWAVE_SECRET_HASH');
    this.fwSecret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
    this.fwPublic = this.config.get<string>('FLUTTERWAVE_PUBLIC_KEY');
  }

  // ---------- Helpers ----------
  private authHeader() {
    return { Authorization: `Bearer ${this.fwSecret}` };
  }

  // ---------- Balance ----------
  async getBalance() {
    // Wallet balances
    const url = `${this.fwBaseUrlV3}/balances`;
    const res = await firstValueFrom(
      this.http.get(url, { headers: this.authHeader() }),
    );
    return res.data; // include available balances per currency
  }

  // ---------- Transactions list (incoming payments) ----------
  async listTransactions(query: { page?: number; status?: string }) {
    const params: any = {};
    if (query.page) params.page = query.page;
    if (query.status) params.status = query.status;
    const url = `${this.fwBaseUrlV3}/transactions`;
    const res = await firstValueFrom(
      this.http.get(url, { headers: this.authHeader(), params }),
    );
    return res.data;
  }

  // ---------- Pay-In (Hosted Payment) ----------
  async createPayin(transactionData: any, userId) {
    transactionData.userId = userId;
    console.log('Create Payin transactionData: ', transactionData);
    const savedTransaction =
      await this.transactionService.createTransaction(transactionData);
    if (!savedTransaction) {
      throw new NotFoundException('Error to save transaction details');
    }

    return this.payinService.createPayin({
      amount: savedTransaction.paymentWithTaxes,
      transactionId: savedTransaction._id,
      currency: savedTransaction.senderCurrency,
      customerEmail: savedTransaction.senderEmail,
      customerName: savedTransaction.senderName,
      status: 'pending',
      userId,
    });
  }

  async verifyPayin(txRef: string) {
    // return this.payinService.verifyPayin(verifyPayin);

    const payin: any = await this.payinService.verifyPayin(txRef);
    console.log('just verifyPayin:', payin);
    if (!payin) {
      throw new NotFoundException('Payin not found');
    }
    const transaction = await this.transactionService.findById(
      String(payin.transactionId),
    );
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (payin.status === 'cancelled') {
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINCLOSED,
      );
      return { message: 'Payin cancelled', status: 'cancelled' };
    } else if (payin.status === 'failed') {
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINFAILED,
      );
      return { message: 'Payin failed', status: 'failed' };
    } else if (payin.status === 'pending') {
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINPENDING,
      );
      return { message: 'Payin pending', status: 'pending' };
    } else {
      if (
        transaction.status === this.tStatus.INITIALIZED ||
        transaction.status === this.tStatus.PAYINCLOSED ||
        transaction.status === this.tStatus.PAYINPENDING ||
        transaction.status === this.tStatus.PAYINERROR
      ) {
        await this.transactionService.updateTransactionStatus(
          String(payin.transactionId),
          this.tStatus.PAYINSUCCESS,
        );
        return { message: 'Payin successful', status: 'successful' };
      }
      return { message: 'Payin already on payout', status: 'onPayout' };
    }
  }

  async verifyAndClosePayin(txRef: string, userId: string, cron = false) {
    const payin: any = await this.payinService.verifyPayin(txRef);
    console.log('verifyAndClosePayin payin:', payin);
    if (!payin) {
      throw new NotFoundException('Payin not found');
    }
    if (String(payin.userId) !== String(userId) && !cron) {
      throw new UnauthorizedException('Unauthorized');
    }
    const transaction = await this.transactionService.findById(
      String(payin.transactionId),
    );
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (
      payin.status === 'cancelled' &&
      transaction.status === this.tStatus.PAYINCLOSED
    ) {
      return { message: 'Payin already cancelled', status: 'cancelled' };
    }
    if (
      (payin.status === 'cancelled' &&
        transaction.status === this.tStatus.PAYINERROR) ||
      (payin.status === 'cancelled' &&
        transaction.status === this.tStatus.INITIALIZED) ||
      (payin.status === 'cancelled' &&
        transaction.status === this.tStatus.PAYINPENDING)
    ) {
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINCLOSED,
      );
      return { message: 'Payin cancelled', status: 'cancelled' };
    }

    if (payin.status === 'successful') {
      if (
        transaction.status === this.tStatus.INITIALIZED ||
        transaction.status === this.tStatus.PAYINCLOSED ||
        transaction.status === this.tStatus.PAYINPENDING ||
        transaction.status === this.tStatus.PAYINERROR
      ) {
        await this.transactionService.updateTransactionStatus(
          String(payin.transactionId),
          this.tStatus.PAYINSUCCESS,
        );
        return { message: 'Payin completed', status: 'successful' };
      }
      return { message: 'Payin already successful', status: 'successful' };
    }

    if (payin.status === 'pending') {
      await this.payinService.updatePayinStatus(txRef, 'cancelled');

      if (
        transaction.status !== this.tStatus.PAYINPENDING &&
        transaction.status !== this.tStatus.INITIALIZED &&
        transaction.status !== this.tStatus.PAYINERROR &&
        transaction.status !== this.tStatus.PAYINCLOSED
      ) {
        await this.transactionService.updateTransactionStatus(
          String(payin.transactionId),
          this.tStatus.PAYINCLOSED,
        );
        return {
          message:
            'Payin is on pending but transaction is on Payout' + payin.txRef,
          status: 'error',
        };
      }
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINCLOSED,
      );
      return {
        message: 'Payin closed',
        status: 'cancelled',
      };
    }
    // Mark transaction as completed
    // transaction.tStatus = 'COMPLETED';
    // await transaction.save();
    return { message: 'Payin already completed', status: 'successful' };
  }

  async openPayin(txRef: string, userId: string) {
    const payin: any = await this.payinService.getPayin(txRef);
    console.log('verify an open payin:', payin);
    if (!payin) {
      throw new NotFoundException('Payin not found');
    }
    if (String(payin.userId) !== String(userId)) {
      throw new UnauthorizedException('Unauthorized');
    }

    const transaction = await this.transactionService.findById(
      String(payin.transactionId),
    );
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (
      payin.status === 'pending' ||
      payin.status === 'cancelled' ||
      payin.status === 'failed'
    ) {
      if (
        transaction.status === this.tStatus.PAYINCLOSED ||
        transaction.status === this.tStatus.INITIALIZED ||
        transaction.status === this.tStatus.PAYINERROR ||
        transaction.status === this.tStatus.PAYINPENDING
      ) {
        console.log('In update status to pending');
        await this.payinService.updatePayinStatus(txRef, 'pending');
        await this.transactionService.updateTransactionStatus(
          String(payin.transactionId),
          this.tStatus.PAYINPENDING,
        );
        return { message: 'Payin opened', status: 'pending' };
      }
      return {
        message: 'Payin is in pending but transaction data is in Payout',
        status: 'error',
      };
    }
    // Mark transaction as completed
    // transaction.tStatus = 'COMPLETED';
    // await transaction.save();
    return {
      message: 'Payin is in pending but transaction data is in Payou',
      status: 'error',
    };
  }

  // ---------- Payouts ----------
  async createPayout(dto: CreatePayoutDto) {
    // Normalize to V4 direct-transfers when possible; fallback to V3 bank transfers
    const action = 'instant';

    if (dto.type === 'bank') {
      // Try V3 bank transfer first for broad availability
      const payloadV3 = {
        account_bank: dto.accountBankCode,
        account_number: dto.accountNumber,
        amount: dto.amount,
        currency: dto.destinationCurrency,
        reference: dto.reference,
        narration: dto.narration ?? 'Payout',
        debit_currency: dto.sourceCurrency,
      };
      const res = await firstValueFrom(
        this.http.post(`${this.fwBaseUrlV3}/transfers`, payloadV3, {
          headers: this.authHeader(),
        }),
      );
      const doc = await this.payoutModel.create({
        reference: dto.reference,
        type: 'bank',
        amount: dto.amount,
        sourceCurrency: dto.sourceCurrency,
        destinationCurrency: dto.destinationCurrency,
        accountBankCode: dto.accountBankCode,
        accountNumber: dto.accountNumber,
        status: ['NEW', 'PENDING', 'QUEUED'].includes(res.data?.data?.status)
          ? 'PROCESSING'
          : 'INITIATED',
        raw: res.data,
      });
      return { api: 'v3', ...res.data, saved: doc };
    }

    if (dto.type === 'mobile_money') {
      // V4 direct transfers mobile money
      const payloadV4 = {
        action,
        type: 'mobile_money',
        reference: dto.reference,
        narration: dto.narration ?? 'Payout MoMo',
        payment_instruction: {
          amount: { value: dto.amount, applies_to: 'destination_currency' },
          source_currency: dto.sourceCurrency,
          destination_currency: dto.destinationCurrency,
          recipient: {
            mobile_money: {
              country: dto.mmCountry, // e.g. 'CM'
              provider: dto.mmProvider, // 'MTN' | 'ORANGE'
              msisdn: dto.msisdn, // '2376XXXXXXX'
            },
          },
        },
      };
      const res = await firstValueFrom(
        this.http.post(`${this.fwBaseUrlV4}/direct-transfers`, payloadV4, {
          headers: this.authHeader(),
        }),
      );
      const doc = await this.payoutModel.create({
        reference: dto.reference,
        type: 'mobile_money',
        amount: dto.amount,
        sourceCurrency: dto.sourceCurrency,
        destinationCurrency: dto.destinationCurrency,
        mmCountry: dto.mmCountry,
        mmProvider: dto.mmProvider,
        msisdn: dto.msisdn,
        status: 'PROCESSING',
        raw: res.data,
      });
      return { api: 'v4', ...res.data, saved: doc };
    }

    if (dto.type === 'wallet') {
      const payloadV4 = {
        action,
        type: 'wallet',
        reference: dto.reference,
        narration: dto.narration ?? 'Wallet to wallet',
        payment_instruction: {
          amount: { value: dto.amount, applies_to: 'destination_currency' },
          source_currency: dto.sourceCurrency,
          destination_currency: dto.destinationCurrency,
          recipient: {
            wallet: {
              provider: 'flutterwave',
              identifier: dto.walletIdentifier,
            },
          },
        },
      };
      const res = await firstValueFrom(
        this.http.post(`${this.fwBaseUrlV4}/direct-transfers`, payloadV4, {
          headers: this.authHeader(),
        }),
      );
      const doc = await this.payoutModel.create({
        reference: dto.reference,
        type: 'wallet',
        amount: dto.amount,
        sourceCurrency: dto.sourceCurrency,
        destinationCurrency: dto.destinationCurrency,
        walletIdentifier: dto.walletIdentifier,
        status: 'PROCESSING',
        raw: res.data,
      });
      return { api: 'v4', ...res.data, saved: doc };
    }
  }

  async verifyPayout(reference: string) {
    const url = `${this.fwBaseUrlV3}/transfers?reference=${reference}`;
    const res: any = await this.http
      .get(url, {
        headers: { Authorization: `Bearer ${this.fwSecret}` },
      })
      .toPromise();

    if (res.data && res.data.data && res.data.data.length > 0) {
      const payout = res.data.data[0];
      await this.payoutModel.findOneAndUpdate(
        { reference },
        { status: payout.status, updatedAt: new Date() },
      );
      return payout;
    }
    throw new NotFoundException('Payout not found on Flutterwave');
  }

  async verifyWebhookPayin(req) {
    return this.payinService.verifyWebhook(req);
  }

  async getBanksList(country: string) {
    const iso2 = this.toIso2(country);
    const url = `${this.fwBaseUrlV3}/banks/${encodeURIComponent(iso2)}`;
    try {
      const res = await firstValueFrom(
        this.http.get(url, { headers: this.authHeader() }),
      );
      // L’endpoint renvoie { status, message, data: [...] }
      return res.data?.data ?? res.data;
    } catch (e: any) {
      const fw = e?.response?.data;
      // message plus clair côté client
      throw new HttpException(
        {
          message:
            fw?.message ??
            `Impossible de récupérer les banques pour le pays "${iso2}"`,
          details: fw ?? e?.message,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private toIso2(country: string): string {
    const input = String(country).trim();

    // si déjà alpha-2
    if (/^[A-Za-z]{2}$/.test(input)) return input.toUpperCase();

    // alpha-3 courants -> alpha-2
    const a3: Record<string, string> = {
      CMR: 'CM',
      NGA: 'NG',
      GHA: 'GH',
      KEN: 'KE',
      RWA: 'RW',
      TZA: 'TZ',
      UGA: 'UG',
      ZAF: 'ZA',
      CIV: 'CI',
      SEN: 'SN',
      BEN: 'BJ',
      TGO: 'TG',
      MLI: 'ML',
      BFA: 'BF',
      NER: 'NE',
      COD: 'CD',
      COG: 'CG',
      MAR: 'MA',
      TUN: 'TN',
      DZA: 'DZ',
      ETH: 'ET',
      ZMB: 'ZM',
    };
    if (/^[A-Za-z]{3}$/.test(input) && a3[input.toUpperCase()]) {
      return a3[input.toUpperCase()];
    }

    // indicatifs téléphoniques -> alpha-2 (liste ciblée; ajoute au besoin)
    const dial: Record<string, string> = {
      '237': 'CM',
      '234': 'NG',
      '233': 'GH',
      '254': 'KE',
      '250': 'RW',
      '255': 'TZ',
      '256': 'UG',
      '27': 'ZA',
      '225': 'CI',
      '221': 'SN',
      '228': 'TG',
      '229': 'BJ',
      '223': 'ML',
      '226': 'BF',
      '227': 'NE',
      '243': 'CD',
      '242': 'CG',
      '212': 'MA',
      '216': 'TN',
      '213': 'DZ',
      '251': 'ET',
      '260': 'ZM',
    };
    if (/^\d{1,4}$/.test(input) && dial[input]) return dial[input];

    // fallback : on renvoie tel quel (laissera FW répondre "invalid country")
    return input.toUpperCase();
  }
}
