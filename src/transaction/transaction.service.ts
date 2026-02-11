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
import { PayinService } from 'src/payin/payin.service';
import { UpdateTransactionDto } from './update-transaction.dto';
import { SystemService } from 'src/system/system.service';
// import { CreateTransactionDto } from './create-transaction.dto';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  private readonly listProjection =
    '-raw -message -token -reqErrorCode -reqStatusCode';

  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: mongoose.Model<Transaction>,
    @InjectModel(Payout.name)
    private payoutModel: mongoose.Model<Payout>,
    private httpService: HttpService,
    private configService: ConfigService,
    private payinService: PayinService,
    private systemService: SystemService,
  ) { }

  async findAll(query: Query): Promise<Transaction[]> {
    const requestedLimit = Number((query as any)?.limit || (query as any)?.resPerPage);
    const resPerPage = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 10;
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
      .select(this.listProjection)
      .limit(resPerPage)
      .sort({ createdAt: -1 }) // Sort recent to old
      .skip(skip)
      .lean();
    return transactions;
  }

  async getAllPayoutTransactoins(query: Query): Promise<Transaction[]> {
    const resPerPage = Number(query?.resPerPage) || 10;
    const currentPage = Number(query?.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keywordFilter = query.keyword
      ? {
        title: { $regex: query.keyword, $options: 'i' },
      }
      : {};

    const res = await this.transactionModel.aggregate([
      {
        $match: {
          $and: [
            { transactionType: { $in: ['transfer', 'withdrawal'] } },
            { ...keywordFilter },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: resPerPage },
      {
        $project: {
          raw: 0,
          message: 0,
          token: 0,
          reqErrorCode: 0,
          reqStatusCode: 0,
        },
      },
    ]);

    return res;
  }

  async getAllPayinTransactions(query: Query): Promise<any[]> {
    return await this.payinService.getAllPayinTransactoins(query);
  }

  async getAllTransactionsOfUser(userId: string, query: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid transaction ID');
    }
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = Number(query.limit || query.resPerPage);
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 20;
    const skip = (page - 1) * limit;

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const matchFilter = {
      $or: [
        { receiverId: userId },
        { senderId: userObjectId },
        { userId: userObjectId },
      ],
    };

    const aggregated = await this.transactionModel.aggregate([
      { $match: matchFilter },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                raw: 0,
                message: 0,
                token: 0,
                reqErrorCode: 0,
                reqStatusCode: 0,
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ]);

    const transactions = aggregated?.[0]?.data || [];
    const total = aggregated?.[0]?.totalCount?.[0]?.count || 0;

    return {
      data: transactions,
      pagination: {
        currentPage: page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page * limit < total,
      },
    };
  }

  async getPayoutListByStatus(status: string, query?: any): Promise<any> {
    const resPerPage = Number(query?.resPerPage) || 10;
    const currentPage = Number(query?.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    let matchCondition: any = {
      transactionType: { $in: ['transfer', 'withdrawal'] },
    };

    switch (status) {
      case 'rejected':
        matchCondition.status = 'transaction_payin_rejected';
        break;

      case 'accepted':
        matchCondition.status = 'transaction_payout_success';
        break;

      case 'pending':
        matchCondition = {
          $and: [
            {
              status: {
                $in: [
                  'transaction_payin_success',
                  'transaction_payout_pending',
                ],
              },
            },
            { transactionType: { $in: ['transfer', 'withdrawal'] } },
          ],
        };
        break;

      case 'error':
        matchCondition = {
          $and: [
            {
              status: {
                $in: ['transaction_payout_error'],
              },
            },
            { transactionType: { $in: ['transfer', 'withdrawal'] } },
          ],
        };
        break;

      default:
        matchCondition.status = 'transaction_payin_success';
        break;
    }

    const res = await this.transactionModel.aggregate([
      { $match: matchCondition },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: resPerPage },
      {
        $project: {
          raw: 0,
          message: 0,
          token: 0,
          reqErrorCode: 0,
          reqStatusCode: 0,
        },
      },
    ]);

    return res;
  }

  async getPayoutPendingListByStatus(query?): Promise<any> {
    const resPerPage = Number(query?.resPerPage) || 10;
    const currentPage = Number(query?.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const eightHoursAgo = new Date();
    eightHoursAgo.setMinutes(eightHoursAgo.getMinutes() - 480);

    const res = await this.transactionModel.aggregate([
      {
        $match: {
          $and: [
            {
              status: {
                $in: ['transaction_payout_pending'],
              },
            },
            {
              transactionType: { $in: ['transfer', 'withdrawal'] }
            },
            {
              updatedAt: { $lt: eightHoursAgo },
            },
          ],
        },
      },
      { $skip: skip },
      { $limit: resPerPage },
    ]);

    return res;
  }

  async getPayinPendingListByStatus(query?): Promise<any> {
    const resPerPage = Number(query?.resPerPage) || 10;
    const currentPage = Number(query?.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const eightHoursAgo = new Date();
    eightHoursAgo.setMinutes(eightHoursAgo.getMinutes() - 480); // 8 hours

    const res = await this.transactionModel.aggregate([
      {
        $match: {
          $and: [
            {
              status: 'transaction_payin_pending',
            },
            {
              updatedAt: { $lt: eightHoursAgo },
            },
          ],
        },
      },
      { $skip: skip },
      { $limit: resPerPage },
    ]);

    return res;
  }

  async getPayinByTxRef(txRef: string) {
    return this.payoutModel.findOne({ txRef }).lean().exec();
  }

  async verifyTransactionPayinStatus(transactionData: any) {
    let payin: any = await this.payinService.getPayinByTxRef(transactionData.txRef);
    console.log('transaction payin 00: ', payin)
    if (!payin) {
      console.log('no Payin found using txRef');
      payin = await this.payinService.getPayinByTransactionId(transactionData._id);
      console.log('transaction payin: ', payin)
      if (!payin) {
        return this.updateTransactionStatus(
          transactionData._id,
          TStatus.PAYINERROR,
        );
      }
    }
    if (payin.status === 'successful') {
      return this.updateTransactionStatus(
        transactionData._id,
        TStatus.PAYINSUCCESS,
      );
    } else if (payin.status === 'cancelled') {
      return this.updateTransactionStatus(
        transactionData._id,
        TStatus.PAYINCLOSED,
      );
    } else if (payin.status === 'failed') {
      return this.updateTransactionStatus(
        transactionData._id,
        TStatus.PAYINERROR,
      );
    } else return false;
  }

  async findById(transactionId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
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

  async getPayoutByTxRef(txRef: string) {
    return this.payoutModel.findOne({ txRef }).lean().exec();
  }

  async verifyTransactionPayoutStatus(transactionData: any) {
    console.log('verifyTransactionPayoutStatus transactionData', transactionData);
    let payout: any = await this.getPayoutByTxRef(transactionData.txRef);
    console.log('verifyTransactionPayoutStatus payout', payout);
    if (!payout) {
      console.log('no Payout found using txRef');
      payout = await this.getPayout(transactionData.txRef);
      console.log('verifyTransactionPayoutStatus payout 000', payout);
      if (!payout) {
        console.log('no Payout found using txRef (Closing transaction):', payout);
        return this.updateTransactionStatus(
          transactionData._id,
          TStatus.PAYOUTCLOSED,
        );
      }
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
    } else if (payout.status === 'PENDING') {
      return this.updateTransactionStatus(
        transactionData._id,
        TStatus.PAYOUTPENDING,
      );
    } else if (payout.status === 'INITIATED') {
      return this.updateTransactionStatus(
        transactionData._id,
        TStatus.PAYOUTPENDING,
      );
    } else return false;
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
  
  async updateTransactionTxRef(
    transactionId: string,
    txRef: string,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }
    const transaction: any = await this.transactionModel.findByIdAndUpdate(
        transactionId,
        { txRef },
        { new: true },
      );
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private async handleTransactionStateSuccess(transactionData): Promise<any> {
    const transaction: any = await this.transactionModel.findById(
      transactionData._id,
    );
    if (transaction && transaction.reqStatus === TStatus.PAYINPENDING) {
      transactionData = await this.updateTransaction(transactionData._id, {
        reqStatusCode: 200,
        message: transactionData.message ? transactionData.message : '',
        reqErrorCode: 0,
      } as any);
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
    const taxesDetails = await this.calculateTaxesAmount(transactionData.estimation);
    const payload = {
      ...transactionData,
      estimation: String(transactionData.estimation),
      receiverAmount: String(transactionData.estimation),
      invoiceTaxes: String(taxesDetails.invoiceTaxes),
      taxesAmount: String(taxesDetails.taxesAmount),
      paymentWithTaxes: String(taxesDetails.paymentWithTaxes),
    };
    console.log('in createTransaction payload:', payload)
    return await this.transactionModel.create(payload);
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

  async calculateTaxesAmount(price: number): Promise<any> {
    const systemData = await this.systemService.getSystemData();
    const taxesAmount = this.arrondOnExeed(price * (systemData.invoiceTaxes / 100));
    const paymentWithTaxes = this.arrondOnExeed(price + taxesAmount);
    return {
      invoiceTaxes: systemData.invoiceTaxes,
      price: this.arrondOnExeed(price),
      taxesAmount,
      // keep legacy key for backward compatibility
      paymentWhitTaxes: paymentWithTaxes,
      paymentWithTaxes,
    }
  }

  aroundValue(val) {
    return Math.ceil(val);
  }

  // arrondi par exès
  arrondOnExeed(nombre: number) {
    if (!Number.isFinite(nombre)) throw new Error("Invalide");
    return Number.isInteger(nombre) ? nombre : Math.ceil(nombre);
  }

  generateInRef(): string {
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
    transactionData: UpdateTransactionDto,
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




  // ---------------- System statistic ------------------------
  async getTransactionsStatistics(): Promise<any> {
    const totalTransferTransaction = await this.getTotalTransferTransaction();

    const totalWithdrawalTransaction = await this.getTotalWithdrawalTransaction();

    const pendingTransferTransaction = await this.getPendingTransferTransaction();

    const pendingWithdrawalTransaction = await this.getPendingWithdrawalTransaction();

    const errorTransferTransaction = await this.getErrorTransferTransaction();

    const errorWithdrawalTransaction = await this.getErrorWithdrawalTransaction();

    const rejectedTransferTransaction = await this.getRejectedTransferTransaction();

    const rejectedWithdrawalTransaction = await this.getRejectedWithdrawalTransaction();

    const endedTransferTransaction = await this.getEndedTransferTransaction();

    const endedWithdrawalTransaction = await this.getEndedWithdrawalTransaction();

    const errorTransactions =
      errorTransferTransaction + errorWithdrawalTransaction;

    const rejectedTransactions =
      rejectedTransferTransaction + rejectedWithdrawalTransaction;

    const pendingTransactions =
      pendingTransferTransaction + pendingWithdrawalTransaction;

    const endedTransactions =
      endedTransferTransaction + endedWithdrawalTransaction;

    const totalPayinTransactions = await this.payinService.getTotalTransaction();;

    const totalPayoutTransactions =
      totalWithdrawalTransaction + totalTransferTransaction;
    
    const totalTransactions = await this.getTotalTransaction();

    return {
      rejectedTransactions,
      pendingTransactions,
      endedTransactions,
      errorTransactions,
      totalPayoutTransactions,
      totalPayinTransactions,
      totalTransactions,
    };
  }

  async getTotalTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments();
  }

  async getTotalTransferTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments(
      {
        transactionType: 'transfer',
      },
    );
  }

  async getTotalWithdrawalTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      transactionType: 'withdrawal',
    });
  }

  async getEndedTransferTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments(
      {
        status: 'transaction_payout_success',
        transactionType: 'transfer',
      },
    );
  }

  async getEndedWithdrawalTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      status: 'transaction_payout_success',
      transactionType: 'withdrawal',
    });
  }

  async getErrorTransferTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments(
      {
        status: 'transaction_payout_error',
        transactionType: 'transfer',
      },
    );
  }

  async getErrorWithdrawalTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      status: 'transaction_payout_error',
      transactionType: 'withdrawal',
    });
  }

  async getPendingTransferTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      status: 'transaction_payin_success',
      transactionType: 'transfer',
    });
  }

  async getPendingWithdrawalTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      status: 'transaction_payin_success',
      transactionType: 'withdrawal',
    });
  }

  async getRejectedTransferTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      status: 'transaction_payin_rejected',
      transactionType: 'transfer',
    });
  }

  async getRejectedWithdrawalTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      status: 'transaction_payin_rejected',
      transactionType: 'withdrawal',
    });
  }
  // ---------------- / System statistic ------------------------

  // ------------------- User transactions statistic
  async getTransactionsStatisticsOfUser(userId: string): Promise<any>{
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    const totalTransactions = await this.getTotalTransferTransactionOfUser(userId);
    const totalPayinTransactions = await this.payinService.getTotalTransactionOfUser(userId);
    const totalPayoutTransactions = totalTransactions - totalPayinTransactions;
    return {
      totalPayoutTransactions,
      totalPayinTransactions,
      totalTransactions,
    };
  }

  async getTotalTransferTransactionOfUser(userId: string): Promise<number> {
    return await this.transactionModel.countDocuments(
      {
        transactionType: 'transfer',
        userId: userId
      },
    );
  }

  async getTotalWithdrawalTransactionOfUser(userId: string): Promise<number> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    return await this.transactionModel.countDocuments({
      transactionType: 'withdrawal',
      userId: userId
    });
  }

  async getTotalTransactionOfUser(userId: string): Promise<number> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    return await this.transactionModel.countDocuments({
      userId: userId
    });
  }
}
