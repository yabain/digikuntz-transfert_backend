/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createCipheriv, createHmac, pbkdf2Sync, randomBytes } from 'crypto';
import { Dev } from './dev.schema';
import * as mongoose from 'mongoose';
import { CreateDevDto } from './create-dev.dto';
import { UpdateDevDto } from './update-dev.dto';
import { TransactionService } from 'src/transaction/transaction.service';
import { PayinService } from 'src/payin/payin.service';
import { TStatus } from 'src/transaction/transaction.schema';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class DevService {
  private static readonly PBKDF2_ITERS = 100_000;
  private static readonly KEY_LEN = 32;
  private static readonly DIGEST = 'sha256';
  private cryptKey: string = process.env.CRYPT_KEY || '';

  constructor(
    @InjectModel(Dev.name)
    private devModel: mongoose.Model<Dev>,
    private transactionService: TransactionService,
    private payinService: PayinService,
    private fwService: FlutterwaveService,
    private userService: UserService
  ) { }

  async getDevDataByUserId(userId): Promise<any> {
    let res = await this.devModel.findOne({userId});
    if (!res) {
      res = await this.createDevData(userId);
      if (!res) return "Dev data already exist";
    };

    return {
      id: res._id.toString(),
      userId: res.userId.toString(),
      status: res.status,
      secretKey: this.encryptWithPassphrase(res.secretKey, this.cryptKey),
      publicKey: this.encryptWithPassphrase(res.publicKey, this.cryptKey)
    };
  }

  // encryptObject(data: any) {
  //   if (data == null || data == undefined || data == "") return null;
  //   data = JSON.stringify(data);
  //   let xxx = CryptoJS.AES.encrypt(data, this.key).toString();
  //   xxx = xxx.replaceAll("/", "AaAaAaA");
  //   return xxx;
  // }

  async getDevDataByKey(userId, secretKey: string): Promise<any> {
    try {
      const res = await this.devModel.findOne({ userId, secretKey });
      if (!res) return null;
      return {
        ...res,
        secretKey: this.encryptWithPassphrase(res.secretKey, this.cryptKey),
        publicKey: this.encryptWithPassphrase(res.publicKey, this.cryptKey)
      };
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }

  async createDevData(userId): Promise<any> {
    const verifUser = await this.verifyUserConditions(userId);
    if (!verifUser) return false;

    const data = await this.getDevDataByUserId(userId);
    if (data) {
      return "Dev data already exist";
    }
    try {
      let devData: any = {
        status: true,
        secretKey: this.generateKey('SK'),
        publicKey: this.generateKey('PK'),
        userId: userId.toString(),
      };
      const res = await this.devModel.create(devData);
      return {
        ...res,
        secretKey: this.encryptWithPassphrase(res.secretKey, this.cryptKey),
        publicKey: this.encryptWithPassphrase(res.publicKey, this.cryptKey)
      }
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
    if (user.verified !== true) return false;
    return true;
  }

  generateKey(prefix = 'key'): string {
    return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  //// - Transaction requests
  async getTransactionData(transactionId: string, userId): Promise<any> {

    const transaction = await this.transactionService.findById(transactionId);
    if (!transaction) return 'no transaction found';
    if (!transaction?.userId?.toString().includes(userId)
    && !transaction?.senderId?.toString().includes(userId)
    && !transaction?.receiverId?.toString().includes(userId)) return 'Unauthorized';

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
      if(!payIn) return 'payin not found';
      setTimeout(async () => {
        if(transaction.status.include('payin')) {
          await this.fwService.verifyPayin(transaction.txRef);
          await this.transactionService.updateTransactionStatus(transactionId, TStatus.PAYINPENDING);
        }
        else if (transaction.status.includes('payout')) {
          await this.fwService.verifyPayout(transaction.txRef, true);
        }
 
      }, 60 * 1000)
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
    console.log('in dev - createPayinTransaction: ', transactionData)

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
      transactionId: createPayin.transactionId,
      status: createPayin.status,
      transactionRef: createPayin.txRef,
      amount: transactionData.estimation,
      paymentCurrency: createPayin.currency,
      paymentWithTaxe: createPayin.amount,
      paymentLink: createPayin?.redirect_url
    }
  }


  encryptWithPassphrase(plainText: string, passphrase: string): string {
    const salt = randomBytes(16);
    const iv = randomBytes(16);
    const key = pbkdf2Sync(
      passphrase,
      salt,
      DevService.PBKDF2_ITERS,
      DevService.KEY_LEN,
      DevService.DIGEST,
    );

    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    const hmac = createHmac('sha256', key)
      .update(Buffer.concat([salt, iv, ciphertext]))
      .digest();

    return [
      salt.toString('base64'),
      iv.toString('base64'),
      ciphertext.toString('base64'),
      hmac.toString('base64'),
    ].join(':');
  }
}
