/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Dev } from './dev.schema';
import * as mongoose from 'mongoose';
import { CreateDevDto } from './create-dev.dto';
import { UpdateDevDto } from './update-dev.dto';
import { TransactionService } from 'src/transaction/transaction.service';
import { PayinService } from 'src/payin/payin.service';

@Injectable()
export class DevService {
  constructor(
    @InjectModel(Dev.name)
    private devModel: mongoose.Model<Dev>,
    private transactionService: TransactionService,
    private payinService: PayinService,
  ) { }

  async getDevDataByUserId(userId): Promise<any> {
    return await this.devModel.findById(userId);
  }

  async getDevDataByKey(userId, secretKey: string): Promise<any> {
    try {
      const res = await this.devModel.findOne({ userId, secretKey });
      return res;
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }

  async createDevData(userId, devData: CreateDevDto): Promise<any> {
    const data = await this.getDevDataByUserId(userId);
    if (data) {
      return "Dev data already exist";
    }

    try {
      const res = await this.devModel.create(devData);
      return res;
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }

  async updateDevData(userId, devData: UpdateDevDto): Promise<any> {
    try {
      const data = await this.getDevDataByUserId(userId);
      if (data) {
        if (data.userId !== userId && data.userId.toString() !== userId) return 'unauthorized';
        await this.devModel.findByIdAndUpdate(data._id, devData);
        return data;
      } else return 'unexisting data'
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }

  async authKey(userId, secretKey: string, verifyStatus = true): Promise<any> {
    try {
      const res = await this.getDevDataByKey(userId, secretKey);
      if (!res) return false;
      if (verifyStatus && res.status === false) return false;
      return true;
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }

  generateKey(prefix = 'key'): string {
    return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  //// - Transaction requests
  async getTransactionData(transactionId: string): Promise<any> {

    const transaction = await this.transactionService.findById(transactionId);
    if (!transaction) return 'no transaction found';
    let status: string = '';
    if (transaction.status === 'transaction_payin_pending') status = 'pending'
    else if (transaction.status === 'transaction_payin_success') status = 'success'
    else if (transaction.status === 'transaction_payin_error') status = 'error'
    else if (transaction.status === 'transaction_payin_closed') status = 'closed'
    else return 'unknown transaction status';
    let payIn: any = '';
    if (transaction.status !== 'transaction_payin_pending' && transaction.status !== 'transaction_payin_success') {
      // payIn = await this.payinService.verifyPayin(transaction.txRef);
      payIn = await this.payinService.getPayinByTransactionId(transactionId);
      if(!payIn) return 'payin not found';
    }
    return {
      id: transaction._id,
      status: status,
      data: { 
        estimation: transaction.estimation,
        transactionRef: transaction.transactionRef,
        invoiceTaxes: transaction.invoiceTaxes,
        paymentWithTaxes: transaction.paymentWithTaxes,
        raisonForTransfer: transaction.raisonForTransfer,
        receiverCurrency: transaction.receiverCurrency,
        receiverEmail: transaction.receiverEmail,
        receiverName: transaction.receiverName,
        transactionType: transaction.transactionType, // type 'apiCall'
        paymentLink: transaction.status !== 'transaction_payin_success' ? (payIn as any)?.raw?.data?.link : '',
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
       }
    }
  }
}
