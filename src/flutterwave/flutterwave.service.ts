/* eslint-disable @typescript-eslint/no-unsafe-call */
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
import { PayoutService } from 'src/payout/payout.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { ExceptionsHandler } from '@nestjs/core/exceptions/exceptions-handler';
import {
  Transaction,
  TStatus,
  TransactionType,
} from 'src/transaction/transaction.schema';
import { BalanceService } from 'src/balance/balance.service';
import { SubscriptionService } from 'src/plans/subscription/subscription.service';

@Injectable()
export class FlutterwaveService {
  private fwSecret: any;
  private fwPublic: any;
  private fwSecretNGN: any;
  private fwPublicNGN: any;
  private fwBaseUrlV3 = 'https://api.flutterwave.com/v3';
  // Some V4 payout endpoints (subject to account enablement)
  private fwBaseUrlV4 = 'https://api.flutterwave.cloud';
  private secretHash: any;
  private tStatus: any = TStatus;
  private transactionType: any = TransactionType;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectModel(Payout.name) private payoutModel: Model<PayoutDocument>,
    private payinService: PayinService,
    private payoutService: PayoutService,
    private transactionService: TransactionService,
    private balanceService: BalanceService,
    private subscriptionService: SubscriptionService,
  ) {
    this.secretHash = this.config.get<string>('FLUTTERWAVE_SECRET_HASH');
    this.fwSecret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
    this.fwPublic = this.config.get<string>('FLUTTERWAVE_PUBLIC_KEY');
    this.fwSecretNGN = this.config.get<string>('FLUTTERWAVE_SECRET_KEY_NGN');
    this.fwPublicNGN = this.config.get<string>('FLUTTERWAVE_PUBLIC_KEY_NGN');
  }

  // ---------- Helpers ----------
  private authHeader() {
    return { Authorization: `Bearer ${this.fwSecret}` };
  }

  private authHeaderNGN() {
    return { Authorization: `Bearer ${this.fwSecretNGN}` };
  }

  // ---------- Balance ----------
  async getBalance(countryWallet) {
    console.log('Getting balance for wallet:', countryWallet);
    // Wallet balances
    const url = `${this.fwBaseUrlV3}/balances`;
    let headers;
    if (countryWallet == 'CM') {
      headers = this.authHeader();
    } else if (countryWallet == 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeaderNGN();
    }
    const res = await firstValueFrom(
      this.http.get(url, {
        headers,
      }),
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

  async listPayinTransactions(
    countryWallet,
    query?: {
      page?: number;
      status?: string;
      from?: string;
      to?: string;
      periode?: number;
    },
  ) {
    console.log('params: ', query?.periode);
    const defaultDate = this.getDateRangeLastMonth(query?.periode || 1);

    const params: any = {};
    params.page = query?.page || 1;
    if (query?.status) params.status = query?.status; //  successful | failed | pending
    params.from = query?.from || defaultDate.from;
    params.to = query?.to || defaultDate.to;

    let headers;
    if (countryWallet == 'CM') {
      headers = this.authHeader();
    } else if (countryWallet == 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeaderNGN();
    }

    const url = `${this.fwBaseUrlV3}/transactions`;
    const res = await firstValueFrom(this.http.get(url, { headers, params }));
    // console.log('res: ', res.data);
    return res.data;
  }

  async listPayoutTransactions(
    countryWallet,
    query?: {
      page?: number;
      status?: string;
      from?: string;
      to?: string;
      periode?: number;
    },
  ) {
    const defaultDate = this.getDateRangeLastMonth(query?.periode || 1);

    const params: any = {};
    params.page = query?.page || 1;
    if (query?.status) params.status = query?.status; // NEW | SUCCESSFUL | FAILED | PROCESSING
    params.from = query?.from || defaultDate.from;
    params.to = query?.to || defaultDate.to;

    let headers;
    if (countryWallet == 'CM') {
      headers = this.authHeader();
    } else if (countryWallet == 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeaderNGN();
    }

    const url = `${this.fwBaseUrlV3}/transfers`;
    const res = await firstValueFrom(this.http.get(url, { headers, params }));
    return res.data;
  }

  private getDateRangeLastMonth(periode: number = 1) {
    console.log('Periode: ', periode);
    const today = new Date();

    // "to" = aujourd’hui
    const to = new Date(today);
    const toStr = to.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // "from" = aujourd’hui - 1 mois
    const from = new Date(today);
    from.setMonth(from.getMonth() - periode);
    const fromStr = from.toISOString().split('T')[0]; // "YYYY-MM-DD"

    return {
      from: fromStr,
      to: toStr,
    };
  }

  // ---------- Pay-In (Hosted Payment) ----------
  async createPayin(transactionData: any, userId) {
    transactionData.userId = userId;
    const raw = {
      ...transactionData,
      userId,
      // transactionType: 'transfer',
    };
    const savedTransaction =
      await this.transactionService.createTransaction(raw);
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

  parseTransactionToSubscription(transaction) {
    return this.subscriptionService.parseTransactionToSubscription(transaction);
  }

  async verifyPayin(txRef: string) {
    const payin: any = await this.payinService.verifyPayin(txRef);
    if (!payin) {
      throw new NotFoundException('Payin not found');
    }
    const transaction = await this.transactionService.findById(
      String(payin.transactionId),
    );
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    console.log('(fw service: verifyPayin) resp payin data: ', payin);
    if (payin.status === 'cancelled') {
      /* Keep the transaction "pending" because the user can
      relaunch new payment attempts on the flutterwave front
      and if the status is no longer in this "pending" state,
      the cron will no longer update it with checks. The "payin cron"
      will take care of closing after 15 minutes with veryfyAndClose. */

      // await this.transactionService.updateTransactionStatus(
      //   String(payin.transactionId),
      //   this.tStatus.PAYINCLOSED,
      // );
      // return { message: 'Payin cancelled', status: 'cancelled' };
      return { message: 'Payin pending', status: 'pending' };
    } else if (payin.status === 'failed') {
      /* Keep the transaction "pending" because the user can
        relaunch new payment attempts on the flutterwave front
        and if the status is no longer in this "pending" state,
        the cron will no longer update it with checks. The "payin cron"
        will take care of closing after 15 minutes. */

      // await this.transactionService.updateTransactionStatus(
      //   String(payin.transactionId),
      //   this.tStatus.PAYINFAILED,
      // );
      // return { message: 'Payin failed', status: 'failed' };

      return { message: 'Payin pending', status: 'pending' };
    } else if (payin.status === 'successful') {
      try {
        console.log('(fw service: verifyPayin) in handle successful ');
        if (transaction.transactionType === this.transactionType.SUBSCRIPTION) {
          await this.handleSubscription(transaction);
        }
        console.log('updating transaction data')
        await this.transactionService.updateTransactionStatus(
          String(payin.transactionId),
          this.tStatus.PAYINSUCCESS,
        );
        return { message: 'Payin already successful', status: 'successful' };
      } catch (err) {
        console.log('(fw service: verifyAndClosePayin) Error: ', err);
        return {
          message: '(fw service: verifyAndClosePayin) Error: ' + err,
          status: 'error',
        };
      }
    } else {
      if (transaction.status !== this.tStatus.PAYINPENDING) {
        await this.transactionService.updateTransactionStatus(
          String(payin.transactionId),
          this.tStatus.PAYINPENDING,
        );
      }
      return { message: 'Payin pending', status: 'pending' };
    }
  }

  async verifyAndClosePayin(txRef: string) {
    const payin: any = await this.payinService.verifyPayin(txRef, true);
    if (!payin) {
      throw new NotFoundException('Payin not found');
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
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINCLOSED,
        payin.raw.data,
      );
      return { message: 'Payin already cancelled', status: 'cancelled' };
    }

    if (payin.status === 'cancelled') {
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINCLOSED,
      );
      await this.payinService.updatePayinStatus(txRef, 'cancelled');
      return { message: 'Payin cancelled', status: 'cancelled' };
    }

    if (payin.status === 'failed') {
      try {
        console.log('transaction to Updated: ', String(payin.transactionId));
       const transactionUpdated = await this.transactionService.updateTransactionStatus(
          String(payin.transactionId),
          this.tStatus.PAYINERROR,
          payin.raw,
        );
        console.log('transactionUpdated: ', transactionUpdated);
        await this.payinService.updatePayinStatus(txRef, 'failed');
        return { message: 'Payin failed', status: 'failed' };
      } catch {
        return { message: '(fw service: verifyAndClosePayin) error to handle failed payin', status: 'failed' };
      }
    }

    if (payin.status === 'successful') {
      try {
        console.log('(fw service: verifyPayin) in handle successful ');
        if (transaction.transactionType === this.transactionType.SUBSCRIPTION) {
          await this.handleSubscription(transaction);
        }
        console.log('updating transaction data')
        await this.transactionService.updateTransactionStatus(
          String(payin.transactionId),
          this.tStatus.PAYINSUCCESS,
        );
        return { message: 'Payin already successful', status: 'successful' };
      } catch (err) {
        console.log('(fw service: verifyAndClosePayin) Error: ', err);
        return {
          message: '(fw service: verifyAndClosePayin) Error: ' + err,
          status: 'error',
        };
      }
    }

    if (
      payin.status === 'pending' &&
      this.payinService.hasExpired60Minutes(payin.createdAt)
    ) {
      await this.payinService.updatePayinStatus(txRef, 'cancelled');
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINCLOSED,
      );
      return {
        message: 'Payin closed',
        status: 'cancelled',
      };
    }

    return { message: 'Unknow status', status: 'Unknow' };
  }

  async handleSubscription(transaction) {

    try {
      const subscriptionStatus =
        await this.subscriptionService.verifySubscription(
          transaction.userId,
          transaction.planId,
        );
      console.log(
        '(fw service: handleSubscription) subscriptionStatus check: ',
        subscriptionStatus,
      );

      if (subscriptionStatus.existingSubscription) {
        console.log(
          '(fw service: handleSubscription) update subscriptionStatus: '
        );

        await this.subscriptionService.upgrateSubscription(
          subscriptionStatus.id,
          Number(transaction.quantity),
        );
      } else {
        await this.createSubscription(transaction);
      }

      const creditBalance = await this.balanceService.creditBalance(
        transaction.planAuthor,
        Number(transaction.estimation),
        transaction.senderCurrency,
      );
      console.log(
        '(fw service: handleSubscription) creditBalance: ',
        creditBalance,
      );
    }
    catch (err) {
      console.log('(fw service: handleSubscription) Error: ', err);
      return {
        message: '(fw service: handleSubscription) Error: ' + err,
        status: 'error',
      };
    }


  }

  async createSubscription(transaction) {
    await this.subscriptionService.createSubscription({
      userId: transaction.senderId,
      planAuthor: transaction.planAuthor,
      planId: transaction.planId,
      quantity: Number(transaction.quantity),
      cycle: transaction.cycle,
      startDate: transaction.createdAt,
      endDate: this.subscriptionService.calculateEndDate(
        transaction.createdAt,
        transaction.cycle,
        Number(transaction.quantity),
      ),
      status: true,
    });
  }

  async openPayin(txRef: string, userId: string) {
    const payin: any = await this.payinService.getPayinByTxRef(txRef);
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
  async createPayout(transactionId: string, userId) {
    const transaction = await this.transactionService.findById(transactionId);
    if (!transaction || transaction.status !== TStatus.PAYINSUCCESS) {
      throw new NotFoundException('Transaction not found or not payin success');
    }

    const payloadPayout = {
      accountBankCode: transaction.bankCode,
      accountNumber: transaction.receiverMobileAccountNumber,
      amount: transaction.receiverAmount,
      destinationCurrency: transaction.receiverCurrency,
      sourceCurrency: transaction.receiverCurrency,
      reference: transaction._id,
      transactionId: transaction._id,
      narration: transaction.raisonForTransfer,
      userId: userId,
      type: this.getreceiverAccountType(transaction), // 'bank' | 'mobile_money' | 'wallet'
    };

    console.log('Payout creation: ', payloadPayout);
    //     {
    //   "accountBankCode": "MTN",
    //   "accountNumber": "237672764405",
    //   "amount": 100,
    //   "destinationCurrency": "XAF",
    //   "sourceCurrency": "XAF",
    //   "reference": "payout_ref_test105",
    //   "narration": "Paiement Orange Money CM",
    //   "type": "mobile_money"
    // }

    const countryCode = this.toIso2(payloadPayout.destinationCurrency);
    let headers: any;

    if (countryCode == 'CM') {
      headers = this.authHeader();
    } else if (countryCode == 'NG') {
      headers = this.authHeaderNGN();
    } else {
      // for coming FW accounts
      headers = this.authHeader();
    }
    try {
      const payload = {
        account_bank: payloadPayout.accountBankCode, // bank or MoMo operator
        account_number: payloadPayout.accountNumber, // account number or MSISDN
        amount: payloadPayout.amount,
        currency: payloadPayout.destinationCurrency,
        reference: payloadPayout.reference,
        narration: payloadPayout.narration,
        debit_currency: payloadPayout.sourceCurrency,
        beneficiary_name: transaction.receiverName,
        meta: [
          {
            beneficiary_country: this.toIso2(transaction.receiverCountryCode),
            sender: transaction.senderName,
            sender_address: transaction.senderCountry,
            sender_country: transaction.senderCountry,
            sender_mobile_number: transaction.senderContact,
          },
        ],
      };

      console.log('payload for sending: ', payload);

      const res = await firstValueFrom(
        this.http.post(`${this.fwBaseUrlV3}/transfers`, payload, {
          headers,
        }),
      );

      console.log('res of fw: ', res);

      const status = this.normalizeStatus(res.data?.data?.status);

      const doc = await this.payoutService.createPayout(payloadPayout, res);

      const resp = { api: 'v3', ...res.data, saved: doc };
      const update = await this.transactionService.updateTransactionStatus(
        transactionId,
        TStatus.PAYOUTPENDING,
      );
      return update;
    } catch (err) {
      if (err.response) {
        console.error('FW Error:', err.response.data);
      } else {
        console.error('Unexpected Error:', err);
      }
      throw err;
    }
  }

  getreceiverAccountType(transaction) {
    if (
      transaction.paymentMethod === 'OM' ||
      transaction.paymentMethod === 'MTN'
    )
      return 'mobile_money';
    else if (transaction.paymentMethod === 'BANK') return 'bank';
    else return 'wallet';
  }

  async verifyPayout(reference: string) {
    return await this.payoutService.verifyPayout(reference);
  }

  /**
   * Normalisation des statuts V3
   */
  private normalizeStatus(status: string): string {
    const map: Record<string, string> = {
      NEW: 'PROCESSING',
      PENDING: 'PROCESSING',
      QUEUED: 'PROCESSING',
      SUCCESSFUL: 'SUCCESSFUL',
      FAILED: 'FAILED',
    };
    return map[status] || 'UNKNOWN';
  }

  async verifyWebhookPayin(req) {
    return this.payinService.verifyWebhook(req);
  }

  async getBanksList(country: string) {
    console.log('getting balance');
    // const iso2 = this.toIso2(country);
    const iso2 = country;
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
      XAF: 'CM',
      Cameroon: 'CM',
      NGA: 'NG',
      NGN: 'NG',
      Nigeria: 'NG',
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
