/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Dev } from './dev.schema';
import * as mongoose from 'mongoose';
import { TransactionService } from 'src/transaction/transaction.service';
import { PayinService } from 'src/payin/payin.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { UserService } from 'src/user/user.service';
import { CryptService } from './crypt.service';
import { BalanceService } from 'src/balance/balance.service';
import { PayoutService } from 'src/payout/payout.service';
import { TStatus } from 'src/transaction/transaction.schema';

@Injectable()
export class DevService {

  constructor(
    @InjectModel(Dev.name)
    private devModel: mongoose.Model<Dev>,
    private transactionService: TransactionService,
    private payinService: PayinService,
    private fwService: FlutterwaveService,
    private userService: UserService,
    private cryptService: CryptService,
    private balanceService: BalanceService,
    private payoutService: PayoutService,
  ) { }

  async getDevDataById(devId): Promise<any> {
    let res = await this.devModel.findById(devId);
    if (!res) {
      return null;
    };

    return {
      id: res.id,
      userId: res.userId.toString(),
      status: res.status,
      webhookUrl: res.webhookUrl || '',
      secretKey: this.cryptService.decryptWithPassphrase(res.secretKey),
      publicKey: this.cryptService.decryptWithPassphrase(res.publicKey)
    };
  }

  async getDevDataByUserId(userId): Promise<any> {
    let res = await this.devModel.findOne({ userId });
    if (!res) {
      const create = await this.createDevData(userId, false, false);
      if (create) return create;
      return null;
    };

    return {
      id: res.id,
      userId: userId,
      status: res.status,
      webhookUrl: res.webhookUrl || '',
      secretKey: this.cryptService.decryptWithPassphrase(res.secretKey),
      publicKey: this.cryptService.decryptWithPassphrase(res.publicKey)
    };
  }

  async getDevDataByKey(userId, secretKey: string): Promise<any> {
    try {
      // const sKey = this.cryptService.encryptWithPassphrase(secretKey);
      const res = await this.devModel.findOne({ userId });
      if (!res) return null;
      if (this.cryptService.decryptWithPassphrase(res.secretKey) !== secretKey) return null;
      return {
        id: res.id,
        userId: res.userId.toString(),
        status: res.status,
        webhookUrl: res.webhookUrl || '',
        secretKey: this.cryptService.decryptWithPassphrase(res.secretKey),
        publicKey: this.cryptService.decryptWithPassphrase(res.publicKey)
      };
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }

  async createDevData(userId, status: boolean = true, verifyExisting: boolean = true): Promise<any> {
    const verifUser = await this.verifyUserConditions(userId);
    if (!verifUser) return false;

    if (verifyExisting) {
      const dev = await this.devModel.findOne({ userId });
      if (dev) return {
        id: dev._id,
        status: dev.status,
        userId: dev.userId,
        webhookUrl: dev.webhookUrl || '',
        secretKey: this.cryptService.decryptWithPassphrase(dev.secretKey),
        publicKey: this.cryptService.decryptWithPassphrase(dev.publicKey)
      };
    }

    try {
      const sKey = this.generateKey('SK');
      const pKey = this.generateKey('PK')
      let devData: any = {
        userId: userId.toString(),
        status,
        secretKey: this.cryptService.encryptWithPassphrase(sKey),
        publicKey: this.cryptService.encryptWithPassphrase(pKey),
      };
      const res = await this.devModel.create(devData);
      return {
        id: res._id,
        status: res.status,
        userId: res.userId,
        webhookUrl: res.webhookUrl || '',
        secretKey: sKey,
        publicKey: pKey
      }
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }

  async resetKey(userId): Promise<any> {
    try {
      const sKey = this.generateKey('SK');
      const pKey = this.generateKey('PK')
      const data = {
        secretKey: this.cryptService.encryptWithPassphrase(sKey),
        publicKey: this.cryptService.encryptWithPassphrase(pKey)
      };
      if (data) {
        const res = await this.devModel.findOneAndUpdate({ userId }, { ...data });
        if(!res) return null;
        return {
          id: res._id,
          status: res.status,
          userId: res.userId,
          webhookUrl: res.webhookUrl || '',
          secretKey: sKey,
          publicKey: pKey
        }
      } else return 'Error to reset key'
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }

  async authKey(userId, secretKey: string, verifyStatus = true): Promise<any> {
    const verifUser = await this.verifyUserConditions(userId);
    if (!verifUser) return false;

    try {
      const res = await this.getDevDataByKey(userId, secretKey);
      if (!res) return false;
      if (verifyStatus && res.status === false) return false;
      return true;
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }

  async verifyUserConditions(userId): Promise<boolean> {
    const user = await this.userService.getUserById(userId);
    if (!user) return false;
    if (user.accountType !== 'organisation' && user.isAdmin !== true) return false;
    if (user.isActive !== true) return false;
    if (user.verified !== true && user.isAdmin !== true) return false;
    return true;
  }

  async updateStatus(userId: string, status: boolean) {
    const devData = await this.getDevDataByUserId(userId);
    if (!devData) return 'no developer found with this id';
    if (devData.userId.toString() !== userId.toString()) return 'unauthorized';
    try {
      const res = await this.devModel.findByIdAndUpdate(devData.id, { status }, { new: true });
      if (!res) return 'error updating data';
      return {
        id: res.id,
        userId: res.userId.toString(),
        status: res.status,
        webhookUrl: res.webhookUrl || '',
        secretKey: this.cryptService.decryptWithPassphrase(res.secretKey),
        publicKey: this.cryptService.decryptWithPassphrase(res.publicKey)
      };
    }
    catch (error: any) {
      throw new ConflictException(error);
    }
  }

  generateKey(prefix = 'key'): string {
    return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  async updateWebhookUrl(userId: string, webhookUrl?: string): Promise<any> {
    const devData = await this.getDevDataByUserId(userId);
    if (!devData) return 'no developer found with this id';
    if (devData.userId.toString() !== userId.toString()) return 'unauthorized';

    const normalizedWebhookUrl = webhookUrl
      ? this.normalizeCallbackUrl(webhookUrl, 'webhookUrl')
      : '';

    try {
      const res = await this.devModel.findByIdAndUpdate(
        devData.id,
        { webhookUrl: normalizedWebhookUrl },
        { new: true },
      );
      if (!res) return 'error updating data';
      return {
        id: res.id,
        userId: res.userId.toString(),
        status: res.status,
        webhookUrl: res.webhookUrl || '',
        secretKey: this.cryptService.decryptWithPassphrase(res.secretKey),
        publicKey: this.cryptService.decryptWithPassphrase(res.publicKey),
      };
    }
    catch (error: any) {
      throw new ConflictException(error);
    }
  }

  //// - Transaction requests
  async getTransactionData(transactionId: string, userId): Promise<any> {

    const transaction = await this.transactionService.findById(transactionId);
    if (!transaction) return 'no transaction found';
    if (!this.isUserInTransaction(transaction, userId)) return 'Unauthorized';

    let status: string = '';
    if (transaction.status === 'transaction_payin_pending') status = 'payin_pending'
    else if (transaction.status === 'transaction_payin_success') status = 'payin_success'
    else if (transaction.status === 'transaction_payin_error') status = 'payin_error'
    else if (transaction.status === 'transaction_payin_closed') status = 'payin_closed'
    else if (transaction.status === 'transaction_payout_pending') status = 'payout_pending'
    else if (transaction.status === 'transaction_payout_success') status = 'payout_success'
    else if (transaction.status === 'transaction_payout_error') status = 'payout_error'
    else if (transaction.status === 'transaction_payout_closed') status = 'payout_closed'
    else if (transaction.status === 'transaction_payout_rejected') status = 'payout_rejected'
    else return 'unknown transaction status';

    let payIn: any = '';
    if (transaction.status !== 'transaction_payin_success') {
      // payIn = await this.payinService.verifyPayin(transaction.txRef);
      payIn = await this.payinService.getPayinByTransactionId(transactionId);
      if (!payIn) return 'payin not found';
      if (transaction.status.includes('payin')) {
        await this.fwService.verifyPayin(transaction.txRef);
        const refreshedPayin = await this.payinService.getPayinByTransactionId(transactionId);
        if (refreshedPayin) payIn = refreshedPayin;
      } else if (transaction.status.includes('payout')) {
        await this.fwService.verifyPayout(transaction.txRef, true);
      }
    }
    return {
      id: transaction._id,
      status: status,
      data: {
        estimation: transaction.estimation,
        transactionRef: transaction.transactionRef,
        invoiceTaxes: transaction.taxesAmount,
        paymentWithTaxes: transaction.paymentWithTaxes,
        raisonForTransfer: transaction.raisonForTransfer,
        receiverCurrency: transaction.receiverCurrency,
        transactionType: transaction.transactionType, // type 'apiCall'
        paymentLink: transaction.status !== 'transaction_payin_success' ? (payIn as any)?.raw?.data?.link : '',
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      }
    }
  }

  async createPayoutTransaction(data: {
    amount: number;
    accountBankCode: string;
    accountNumber: string;
    receiverName: string;
    currency: string;
    narration?: string;
    callbackUrl?: string;
  }, userId: string): Promise<any> {
    const devData = await this.getDevDataByUserId(userId);
    const webhookUrl = devData?.webhookUrl
      ? this.normalizeCallbackUrl(devData.webhookUrl, 'webhookUrl')
      : undefined;
    const user = await this.userService.getUserById(userId);
    if (!user) throw new ConflictException('user not found');
    const payoutAmount = Number(data.amount);
    if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      throw new ConflictException('Invalid payout amount');
    }

    const balance = await this.balanceService.getBalanceByUserId(userId);
    if (balance.balance < payoutAmount) {
      throw new ConflictException('Insufficient balance');
    }

    const txRef = this.payoutService.generateTxRef('txApiPayout');
    const transactionData: any = {
      transactionRef: this.transactionService.generateInRef(),
      txRef,
      estimation: payoutAmount,
      transactionType: 'apiCall',
      userId,
      senderId: userId,
      receiverId: userId,
      senderName: this.userService.showName(user),
      senderEmail: user.email,
      senderContact: user.phone,
      senderCountry: user.countryId.name,
      senderCurrency: user.countryId.currency,
      receiverName: data.receiverName,
      receiverCurrency: data.currency,
      receiverCountryCode: user.countryId?.code,
      bankCode: data.accountBankCode,
      bankAccountNumber: data.accountNumber,
      raisonForTransfer: data.narration || 'API Payout',
      status: TStatus.PAYINSUCCESS,
      noFees: true,
      // Marque la transaction comme un retrait initié via API : permet aux
      // vues et notifications admin de l'inclure aux côtés des withdrawals
      // « natifs » sans changer le `transactionType` (rétro-compatibilité).
      isApiPayout: true,
      ...(webhookUrl && { callbackUrl: webhookUrl }),
    };

    await this.balanceService.debitBalance(userId, payoutAmount, user.countryId.currency);

    const savedTransaction = await this.transactionService.createTransaction(transactionData);
    if (!savedTransaction) throw new ConflictException('Error saving transaction');
    void this.fwService.notifyAdminPayoutPending(savedTransaction).catch((error) => {
      console.error('API payout admin notification failed:', error?.message || error);
    });

    return {
      id: savedTransaction._id,
      status: 'payout_pending',
      data: {
        estimation: savedTransaction.estimation,
        transactionRef: savedTransaction.transactionRef,
        invoiceTaxes: savedTransaction.taxesAmount,
        paymentWithTaxes: savedTransaction.paymentWithTaxes,
        raisonForTransfer: savedTransaction.raisonForTransfer,
        receiverCurrency: savedTransaction.receiverCurrency,
        transactionType: savedTransaction.transactionType,
        createdAt: savedTransaction.createdAt,
        updatedAt: savedTransaction.updatedAt,
      },
    };
  }

  async createPayinTransaction(transactionData: any, userId): Promise<any> {
    const flutterwaveCallbackUrl = this.normalizeCallbackUrl(
      transactionData?.callbackUrl,
      'callbackUrl',
    );
    if (flutterwaveCallbackUrl) {
      transactionData.redirectUrl = flutterwaveCallbackUrl;
    } else {
      delete transactionData.redirectUrl;
    }

    const devData = await this.getDevDataByUserId(userId);
    const webhookUrl = devData?.webhookUrl
      ? this.normalizeCallbackUrl(devData.webhookUrl, 'webhookUrl')
      : undefined;

    if (webhookUrl) {
      transactionData.callbackUrl = webhookUrl;
    } else {
      delete transactionData.callbackUrl;
    }

    const createPayin = await this.fwService.createPayin(transactionData, userId);

    const transaction = await this.transactionService.findById(
      String(createPayin.transactionId),
    );

    const statusMap: Record<string, string> = {
      transaction_payin_pending: 'payin_pending',
      transaction_payin_success: 'payin_success',
      transaction_payin_error: 'payin_error',
      transaction_payin_closed: 'payin_closed',
      transaction_payout_pending: 'payout_pending',
      transaction_payout_success: 'payout_success',
      transaction_payout_error: 'payout_error',
      transaction_payout_closed: 'payout_closed',
      transaction_payout_rejected: 'payout_rejected',
    };

    return {
      id: transaction._id,
      status: statusMap[transaction.status] ?? transaction.status,
      data: {
        estimation: transaction.estimation,
        transactionRef: transaction.transactionRef,
        invoiceTaxes: transaction.taxesAmount,
        paymentWithTaxes: transaction.paymentWithTaxes,
        raisonForTransfer: transaction.raisonForTransfer,
        receiverCurrency: transaction.receiverCurrency,
        transactionType: transaction.transactionType,
        paymentLink: createPayin?.redirect_url,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      },
    };
  }

  async getUserBalance(userId): Promise<any> {
    const user = await this.userService.getUserById(userId);
    if (!user) return 'no user found';
    const balance = await this.balanceService.getBalanceByUserId(userId);
    return {
      balance: balance.balance,
      currency: user.countryId.currency,
      lastUpdate: balance.updatedAt
    }
  }

  async getTransactions(userId: string, query: { page?: number; limit?: number }): Promise<any> {
    const page = Number(query?.page) > 0 ? Number(query.page) : 1;
    const limit = Number(query?.limit) > 0 ? Number(query.limit) : 20;

    const res = await this.transactionService.getAllTransactionsOfUser(userId, {
      page,
      limit,
    });

    return {
      data: res?.data || [],
      pagination: res?.pagination || {
        currentPage: page,
        limit,
        totalPages: 0,
        totalItems: 0,
        hasNextPage: false,
      },
    };
  }

  private toIdString(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && '_id' in value) {
      const raw = (value as { _id: unknown })._id;
      return raw ? String(raw) : '';
    }
    return String(value);
  }

  private isUserInTransaction(transaction: any, userId: string): boolean {
    const normalizedUserId = String(userId);
    const userIdFromTx = this.toIdString(transaction?.userId);
    const senderId = this.toIdString(transaction?.senderId);
    const receiverId = this.toIdString(transaction?.receiverId);

    return (
      userIdFromTx === normalizedUserId ||
      senderId === normalizedUserId ||
      receiverId === normalizedUserId
    );
  }

  private normalizeCallbackUrl(callbackUrl?: string, fieldName = 'callbackUrl'): string | undefined {
    if (!callbackUrl) return undefined;

    let parsed: URL;
    try {
      parsed = new URL(callbackUrl);
    } catch {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (isProduction && protocol !== 'https:') {
      throw new BadRequestException(`${fieldName} must use HTTPS in production`);
    }

    if (!isProduction && !['http:', 'https:'].includes(protocol)) {
      throw new BadRequestException(`${fieldName} must use HTTP or HTTPS`);
    }

    if (isProduction && this.isPrivateCallbackHost(hostname)) {
      throw new BadRequestException(`${fieldName} host is not allowed`);
    }

    parsed.hash = '';
    return parsed.toString();
  }

  private isPrivateCallbackHost(hostname: string): boolean {
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '0.0.0.0'
    ) {
      return true;
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      const [a, b] = hostname.split('.').map(Number);
      return (
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
      );
    }

    return false;
  }
}
