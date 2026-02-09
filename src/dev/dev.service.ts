/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConflictException, Injectable } from '@nestjs/common';
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
    private balanceService: BalanceService
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

  //// - Transaction requests
  async getTransactionData(transactionId: string, userId): Promise<any> {

    const transaction = await this.transactionService.findById(transactionId);
    if (!transaction) return 'no transaction found';
    if (!this.isUserInTransaction(transaction, userId)) return 'Unauthorized';

    let status: string = '';
    if (transaction.status === 'transaction_payin_pending') status = 'pending'
    else if (transaction.status === 'transaction_payin_success') status = 'success'
    else if (transaction.status === 'transaction_payin_error') status = 'error'
    else if (transaction.status === 'transaction_payin_closed') status = 'closed'
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

  async createPayinTransaction(transactionData: any, userId): Promise<any> {
    const createPayin = await this.fwService.createPayin(transactionData, userId);
    // return createPayin;
    // const transaction = await this.transactionService.create({
    //   ...transactionData,
    //   userId,
    //   status: 'transaction_payin_pending',
    //   transactionType: 'apiCall'
    // });

    // const newTxRef = `txref-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    // const payin = await this.payinService.create({
    //   amount: transaction.paymentWithTaxes,
    //   currency: transaction.receiverCurrency,
    //   txRef: newTxRef,
    //   transactionId: transaction._id,
    //   userId,
    //   status: 'payin_pending',
    // });

    return {
      id: createPayin.transactionId,
      status: createPayin.status,
      transactionRef: createPayin.txRef,
      amount: transactionData.estimation,
      paymentCurrency: createPayin.currency,
      paymentWithTaxes: createPayin.amount,
      paymentLink: createPayin?.redirect_url
    }
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
}
