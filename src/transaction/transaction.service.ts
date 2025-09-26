/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */

/* eslint-disable @typescript-eslint/no-unsafe-argument */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  NotFoundException,
  Logger,
  // UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TStatus } from './transaction.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Transaction } from './transaction.schema';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { Payout } from 'src/payout/payout.schema';
// import { PayoutService } from 'src/payout/payout.service';
// import { CreateTransactionDto } from './create-transaction.dto';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: mongoose.Model<Transaction>,
    @InjectModel(Payout.name)
    private payoutModel: mongoose.Model<Payout>,
    private httpService: HttpService,
    private configService: ConfigService,
    // private payoutService: PayoutService,
  ) {}

  async findAll(query: Query): Promise<Transaction[]> {
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
    const transactions = await this.transactionModel
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);
    return transactions;
  }

  async getPayoutListByStatus(status, query?): Promise<any> {
    console.log('status: ', status);
    const resPerPage = Number(query?.resPerPage) || 10;
    const currentPage = Number(query?.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    let res: any;
    if (status == 'rejected') {
      res = await this.transactionModel.aggregate([
        {
          $match: {
            status: 'transaction_payin_rejected',
            transactionType: { $in: ['transfer', 'withdrawal'] },
          },
        },
        { $skip: skip },
        { $limit: resPerPage },
      ]);
    } else if (status == 'accepted') {
      res = await this.transactionModel.aggregate([
        {
          $match: {
            status: 'transaction_payout_success',
            transactionType: { $in: ['transfer', 'withdrawal'] },
          },
        },
        { $skip: skip },
        { $limit: resPerPage },
      ]);
    } else if (status == 'pending') {
      res = await this.transactionModel.aggregate([
        {
          $match: {
            $and: [
              {
                status: {
                  $in: [
                    'transaction_payin_success',
                    'transaction_payout_pending',
                    'transaction_payout_error',
                  ],
                },
              },
              { transactionType: { $in: ['transfer', 'withdrawal'] } },
            ],
          },
        },
        { $skip: skip },
        { $limit: resPerPage },
      ]);
    } else {
      res = await this.transactionModel.aggregate([
        {
          $match: {
            status: 'transaction_payin_success',
            transactionType: { $in: ['transfer', 'withdrawal'] },
          },
        },
        { $skip: skip },
        { $limit: resPerPage },
      ]);
    }
    console.log('result of ' + status, res.length);

    return res;
  }

  async getPayoutPendingListByStatus(query?): Promise<any> {
    const resPerPage = Number(query?.resPerPage) || 10;
    const currentPage = Number(query?.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const res = await this.transactionModel.aggregate([
      {
        $match: {
          $and: [
            {
              status: {
                $in: ['transaction_payout_pending'],
              },
            },
            { transactionType: { $in: ['transfer', 'withdrawal'] } },
          ],
        },
      },
      { $skip: skip },
      { $limit: resPerPage },
    ]);

    return res;
  }

  async findById(transactionId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid event ID');
    }

    // Find the transaction and populate related data (user and event)
    const transaction: any = await this.transactionModel
      .findById(transactionId)
      .populate('userId');
    if (!transaction) {
      throw new NotFoundException('transaction not found');
    }
    transaction.userId.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
    transaction.userId.password = ''; // Remove the password from the response for security

    return transaction;
  }

  async getTransactionsStatistics(): Promise<any> {
    const totalTransferTransaction = await this.transactionModel.countDocuments(
      {
        transactionType: 'transfer',
      },
    );

    const totalWithdrawalTransaction =
      await this.transactionModel.countDocuments({
        transactionType: 'withdrawal',
      });

    const pendingTransferTransaction =
      await this.transactionModel.countDocuments({
        status: 'transaction_payin_success',
        transactionType: 'transfer',
      });

    const pendingWithdrawalTransaction =
      await this.transactionModel.countDocuments({
        status: 'transaction_payin_success',
        transactionType: 'withdrawal',
      });

    // const errorTransferTransaction = await this.transactionModel.countDocuments(
    //   {
    //     status: 'transaction_payin_error',
    //     transactionType: 'transfer',
    //   },
    // );

    // const errorWithdrawalTransaction =
    //   await this.transactionModel.countDocuments({
    //     status: 'transaction_payin_error',
    //     transactionType: 'withdrawal',
    //   });

    const rejectedTransferTransaction =
      await this.transactionModel.countDocuments({
        status: 'transaction_payin_rejected',
        transactionType: 'transfer',
      });

    const rejectedWithdrawalTransaction =
      await this.transactionModel.countDocuments({
        status: 'transaction_payin_rejected',
        transactionType: 'withdrawal',
      });

    const endedTransferTransaction = await this.transactionModel.countDocuments(
      {
        status: 'transaction_payout_success',
        transactionType: 'transfer',
      },
    );

    const endedWithdrawalTransaction =
      await this.transactionModel.countDocuments({
        status: 'transaction_payout_success',
        transactionType: 'withdrawal',
      });

    const totalTransaction =
      totalTransferTransaction + totalWithdrawalTransaction;

    const rejectedTransaction =
      rejectedTransferTransaction + rejectedWithdrawalTransaction;

    const pendingTransaction =
      pendingTransferTransaction + pendingWithdrawalTransaction;

    const endedTransaction =
      endedTransferTransaction + endedWithdrawalTransaction;

    return {
      totalTransaction,
      rejectedTransaction,
      pendingTransaction,
      endedTransaction,
    };
  }

  async getTransactionsListOfUser(
    userId: any,
    query: Query,
  ): Promise<Transaction[]> {
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
    const transactions = await this.transactionModel
      .find({ ...keyword, userId })
      .limit(resPerPage)
      .skip(skip);
    return transactions;
  }

  async getPayout(reference: string) {
    return this.payoutModel.findOne({ reference }).lean().exec();
  }

  async verifyTransactionPayoutStatus(transactionData: any) {
    const payout: any = await this.getPayout(transactionData._id);
    if (!payout) {
      return false;
    }
    if (payout.status === 'SUCCESSFUL') {
      return this.updateTransactionStatus(
        transactionData._id,
        TStatus.PAYOUTSUCCESS,
      );
    } else if (payout.status === 'FAILED') {
      return this.updateTransactionStatus(
        transactionData._id,
        TStatus.PAYOUTERROR,
      );
    } else return true;
  }

  async updateTransactionStatus(
    transactionId: string,
    status: TStatus,
    raw?: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }
    let transaction: any;
    if (raw) {
      transaction = await this.transactionModel.findByIdAndUpdate(
        transactionId,
        { status: status, raw },
        { new: true },
      );
    } else {
      transaction = await this.transactionModel.findByIdAndUpdate(
        transactionId,
        { status: status },
        { new: true },
      );
    }
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private async handleTransactionStateSuccess(transactionData): Promise<any> {
    const transaction: any = await this.transactionModel.findById(
      transactionData._id,
    );
    if (transaction && transaction.reqStatus === TStatus.PAYINPENDING) {
      transactionData = await this.updateTransaction(transactionData._id, {
        reqStatus: TStatus.SUCCESS,
        message: transactionData.message ? transactionData.message : '',
        reqErrorCode: '',
      });
      return {
        success: true,
        status: transactionData.reqStatus,
        transactionData: transactionData,
      };
    } else if (transaction && transaction.reqStatus === TStatus.SUCCESS) {
      return {
        success: true,
        status: transactionData.reqStatus,
        transactionData: transactionData,
      };
    } else {
      return {
        success: false,
        status: transaction.reqStatus,
        transactionData: transaction,
        message: `Transaction status is not on Pending, Couldn't update on Success`,
      };
    }
  }

  // private async handleTransactionStateError(transactionData): Promise<any> {
  //   if (transactionData._id) {
  //     const transaction = await this.transactionModel.findById(
  //       transactionData._id,
  //     );
  //     if (transaction && transaction.reqStatus === ReqStatus.PENDING) {
  //       const transactionUpdate: any = await this.updateTransaction(
  //         transactionData._id,
  //         {
  //           reqStatus: ReqStatus.ERROR,
  //           message: transactionData.message ? transactionData.message : '',
  //           reqErrorCode: transactionData.reqErrorCode
  //             ? transactionData.reqErrorCode
  //             : '',
  //         },
  //       );
  //       return {
  //         success: true,
  //         status: transactionUpdate.reqStatus,
  //         transactionData: transactionUpdate,
  //       };
  //     } else if (transaction && transaction.reqStatus === ReqStatus.ERROR) {
  //       return {
  //         success: true,
  //         status: transaction.reqStatus,
  //         transactionData: transaction,
  //       };
  //     } else throw new NotFoundException('Transaction not found');
  //   }
  //   transactionData.reqStatus === ReqStatus.ERROR;
  //   const transaction: any = await this.createTransaction(transactionData);
  //   if (!transaction)
  //     throw new NotFoundException('Can not save transaction Error data');
  //   return {
  //     success: true,
  //     status: transaction.reqStatus,
  //     transactionData: transaction,
  //   };
  // }

  async createTransaction(transactionData: any): Promise<any> {
    return await this.transactionModel.create(transactionData);
  }

  private async chechTransactionStatus(
    transactionId: string,
    // userData: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }
    // const transaction = await this.getTransactionData(transactionId, userData);
    const transaction = await this.getTransactionData(transactionId);
    if (!transaction) throw new NotFoundException('Transaction not found.');
    // if (transaction.userId !== userData._id && !userData.isAdmin) {
    //   throw new UnauthorizedException('Unauthorized');
    // }
    return {
      success: true,
      status: transaction.status,
      transactionData: transaction,
    };
  }

  private async getTransactionData(
    transactionId: string,
    // userData: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }
    const transaction = await this.transactionModel.findById(transactionId);
    if (!transaction) throw new NotFoundException('Transaction not found');
    // if (transaction.userId !== userData._id && !userData.isAdmin) {
    //   throw new UnauthorizedException('Unauthorized');
    // }

    return transaction;
  }

  generateRef(): string {
    const now = new Date();

    // Generate the components of the date and time
    const year = now.getFullYear().toString().slice(-2); // Last two digits of the year
    const month = this.padNumber(now.getMonth() + 1, 2); // Months are zero-based, hence the +1
    const day = this.padNumber(now.getDate(), 2);
    const hours = this.padNumber(now.getHours(), 2);
    const minutes = this.padNumber(now.getMinutes(), 2);
    const seconds = this.padNumber(now.getSeconds(), 2);

    // Generate a random number between 100 and 999
    const randomNum = Math.floor(Math.random() * 900) + 100;

    // Construct the ID
    const id = `IN${randomNum}#${year}${month}${day}${hours}${minutes}${seconds}`;

    return id;
  }

  // Helper function to pad numbers with leading zeros
  private padNumber(num: number, size: number): string {
    let s = num.toString();
    while (s.length < size) {
      s = '0' + s;
    }
    return s;
  }

  private interprateErrorCode(errorCode: number) {
    const errorMessages: { [key: number]: string } = {
      '-201': 'Payer account not found',
      '-202': 'Receiver account not found',
      '-200': 'Unknown error',
      '-204': 'The balance of the payer account is insufficient',
      '-205': 'Payment method not found',
      '-206': 'Invalid amount',
      '-207': 'Waiting for a long time error',
      '-208': 'Payment rejected by the payer',
    };
    return errorMessages[errorCode] || 'Unknown code error';
  }

  async deleteTransaction(transactionId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }
    return await this.transactionModel.findByIdAndDelete(transactionId);
  }

  async updateTransaction(
    transactionId: string,
    transactionData: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }

    const transaction = await this.transactionModel
      .findByIdAndUpdate(transactionId, transactionData, {
        new: true,
        runValidators: true,
      })
      .populate('userId');

    if (!transaction)
      throw new NotFoundException('Error to update transaction');

    return transaction;
  }

  isPastDateTime(dateStr: string): boolean {
    const targetDateTime = new Date(`${dateStr}`);
    const currentDateTime = new Date();
    return targetDateTime > currentDateTime;
  }
}
