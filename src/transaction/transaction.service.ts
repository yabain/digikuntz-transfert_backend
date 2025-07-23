/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */

/* eslint-disable @typescript-eslint/no-unsafe-argument */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpService } from '@nestjs/axios';
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReqStatus, PaymentMethode } from './transaction.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Transaction } from './transaction.schema';
import * as mongoose from 'mongoose';
import { User } from 'src/user/user.schema';
import { Query } from 'express-serve-static-core';
import { CreateTransactionDto } from './create-transaction.dto';
import { firstValueFrom } from 'rxjs';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: mongoose.Model<Transaction>,
    private httpService: HttpService,
    private configService: ConfigService,
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
      .find({ ...keyword, type: 'public' })
      .limit(resPerPage)
      .skip(skip);
    return transactions;
  }

  async findById(transactionId: string, userData: User): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid event ID');
    }

    // Find the transaction and populate related data (user and event)
    const transaction: any = await this.transactionModel
      .findById(transactionId)
      .populate('userId')
      .populate('eventId');
    if (!transaction) {
      throw new NotFoundException('transaction not found');
    }
    transaction.userId.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
    transaction.userId.password = ''; // Remove the password from the response for security
    const user = transaction.userId;
    if (user._id != userData._id && !userData.isAdmin) {
      throw new NotFoundException('Event not found');
    }

    if (transaction.reqStatus === ReqStatus.PENDING) {
      this.handleTransactionStatePending(transaction, userData);
    }

    return {
      success: true,
      status: transaction.reqStatus,
      transactionData: transaction,
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

  async processPayment(paymentData: any, userData: User): Promise<any> {
    try {
      const depositEndPoint = `${this.configService.get<string>('PAYMENT_GATWAY')}/payment/pay`;
      const depositData = {
        amount: Number(paymentData.paymentWithTaxes),
        type: 'deposit',
        paymentMode:
          paymentData.paymentMethod === 'OM'
            ? PaymentMethode.OM
            : PaymentMethode.MTN,
        moneyCode: 'XAF',
        userRef: {
          fullName: paymentData.userName,
          account: `${paymentData.paymentMethodNumber}`,
        },
        raison: 'Ticket - Yabi Events',
        appID: this.configService.get<string>('PAYMENT_GATWAY_KEY'),
      };

      console.log('depositData: ', depositData);
      const response = await firstValueFrom(
        this.httpService.post(depositEndPoint, depositData, {
          headers: {
            Authorization: `Bearer ${this.configService.get<string>('PAYMENT_GATWAY_KEY')}`,
          },
        }),
      );

      const transaction = this.dataParser(paymentData, response.data, userData);

      return this.handleRequest(transaction, userData);
    } catch (error) {
      console.error(
        'Payment processing error:',
        error.response?.data || error.message,
      );

      const transaction = this.dataParser(paymentData, error || {}, userData);
      await this.handleTransactionStateError(transaction);

      return {
        success: false,
        status: transaction.reqStatus,
        transactionData: transaction,
      };
    }
  }

  async checkTransactionLoop(
    transactionData: any,
    userData: User,
  ): Promise<void> {
    let attempts = 0;
    const maxAttempts = 24; // After 2 minutes (24 x 5s)

    const checkStatus = async () => {
      try {
        const checkDepositEndPoint = `${this.configService.get<string>('PAYMENT_GATWAY')}/payment/check/${transactionData.token}`;
        const response: any = await firstValueFrom(
          this.httpService.get<any>(checkDepositEndPoint),
        );

        const newTransactionData = this.dataParser(
          transactionData,
          response.data,
          userData,
        );
        if (response.data.statusCode === 200) {
          if (newTransactionData.reqStatus === ReqStatus.SUCCESS) {
            await this.handleTransactionStateSuccess(newTransactionData);
            return; // On arrête la boucle
          } else if (newTransactionData.reqStatus === ReqStatus.ERROR) {
            await this.handleTransactionStateError(newTransactionData);
            return; // On arrête la boucle
          }
        }
      } catch (error) {
        console.error('Error checking transaction: ', error.message);
      }
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkStatus, 5000);
      } else {
        // Ici, on peut marquer la transaction comme échouée ou notifier l'utilisateur
        console.warn('Max attempts reached, stopping transaction check.');
        await this.handleTransactionStateError({
          ...transactionData,
          message: 'Transaction timeout: no final state after max attempts',
          reqStatus: ReqStatus.ERROR,
        });
      }
    };

    checkStatus();
  }

  private async handleRequest(transactionData, userData): Promise<any> {
    if (transactionData.reqStatus === ReqStatus.SUCCESS) {
      return {
        success: true,
        status: transactionData.reqStatus,
        transactionData: transactionData,
      };
    } else if (transactionData.reqStatus === ReqStatus.PENDING) {
      return this.handleTransactionStatePending(transactionData, userData);
    } else if (transactionData.reqStatus === ReqStatus.ERROR) {
      return this.handleTransactionStateError(transactionData);
    } else
      return {
        success: false,
        status: 'Error',
        transactionData: transactionData,
      };
  }

  private async handleTransactionStateSuccess(transactionData): Promise<any> {
    const transaction: any = await this.transactionModel.findById(
      transactionData._id,
    );
    if (transaction && transaction.reqStatus === ReqStatus.PENDING) {
      transactionData = await this.updateTransaction(transactionData._id, {
        reqStatus: ReqStatus.SUCCESS,
        message: transactionData.message ? transactionData.message : '',
        reqErrorCode: '',
      });
      return {
        success: true,
        status: transactionData.reqStatus,
        transactionData: transactionData,
      };
    } else if (transaction && transaction.reqStatus === ReqStatus.SUCCESS) {
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

  private async handleTransactionStatePending(
    transactionData,
    userData,
  ): Promise<any> {
    if (transactionData._id) {
      const transaction = await this.transactionModel.findById(
        transactionData._id,
      );
      if (transaction) {
        // await this.updateTransaction(transactionData._id, {
        //   reqStatus: ReqStatus.PENDING,
        //   message: transactionData.message || '',
        //   reqErrorCode: transactionData.reqErrorCode || '',
        // });

        if (transaction.reqStatus === ReqStatus.PENDING)
          this.checkTransactionLoop(transactionData, userData);
        return {
          success: true,
          status: transaction.reqStatus,
          transactionData: transaction,
        };
      } else throw new NotFoundException('Transaction not found');
    } else {
      const newTransaction = await this.createTransaction(transactionData);
      if (!newTransaction) {
        throw new NotFoundException('Error to create transaction');
      }
      this.checkTransactionLoop(newTransaction, userData);
      return {
        success: true,
        status: newTransaction.reqStatus,
        transactionData: newTransaction,
      };
    }
  }

  private async handleTransactionStateError(transactionData): Promise<any> {
    if (transactionData._id) {
      const transaction = await this.transactionModel.findById(
        transactionData._id,
      );
      if (transaction && transaction.reqStatus === ReqStatus.PENDING) {
        const transactionUpdate: any = await this.updateTransaction(
          transactionData._id,
          {
            reqStatus: ReqStatus.ERROR,
            message: transactionData.message ? transactionData.message : '',
            reqErrorCode: transactionData.reqErrorCode
              ? transactionData.reqErrorCode
              : '',
          },
        );
        return {
          success: true,
          status: transactionUpdate.reqStatus,
          transactionData: transactionUpdate,
        };
      } else if (transaction && transaction.reqStatus === ReqStatus.ERROR) {
        return {
          success: true,
          status: transaction.reqStatus,
          transactionData: transaction,
        };
      } else throw new NotFoundException('Transaction not found');
    }
    transactionData.reqStatus === ReqStatus.ERROR;
    const transaction: any = await this.createTransaction(transactionData);
    if (!transaction)
      throw new NotFoundException('Can not save transaction Error data');
    return {
      success: true,
      status: transaction.reqStatus,
      transactionData: transaction,
    };
  }

  private async createTransaction(
    transactionData: CreateTransactionDto,
  ): Promise<any> {
    return await this.transactionModel.create(transactionData);
  }

  private async chechTransactionStatus(
    transactionId: string,
    userData: User,
  ): Promise<any> {
    const transaction = await this.getTransactionData(transactionId);
    if (!transaction) throw new NotFoundException('Transaction not found.');
    if (transaction && transaction.reqStatus === ReqStatus.PENDING) {
      return this.handleTransactionStatePending(transaction, userData);
    } else if (transaction && transaction.reqStatus === ReqStatus.SUCCESS) {
      return {
        success: true,
        status: 'Success',
        transactionData: transaction,
      };
    } else if (transaction && transaction.reqStatus === ReqStatus.ERROR) {
      return {
        success: true,
        status: 'Rejected',
        transactionData: transaction,
      };
    }
  }

  private async getTransactionData(transactionId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }
    const transaction = await this.transactionModel.findById(transactionId);
    if (!transaction) throw new NotFoundException('Transaction not found');

    return transaction;
  }

  dataParser(transactionData: any, responseData: any, userData: any) {
    if (responseData.statusCode === 401)
      responseData.message = 'Unauthorised request';
    else if (responseData.statusCode === 404)
      responseData.message = 'APP id not found';
    else if (responseData.statusCode > 500)
      responseData.message = 'Internal server error';
    else
      responseData.data.message =
        responseData.data.error != 0
          ? this.interprateErrorCode(Number(responseData.data.error))
          : ''; // Deduced from the response code

    return {
      _id: transactionData._id ? transactionData._id : undefined,
      reqStatusCode: responseData.statusCode, // as statusCode in payment API res
      reqErrorCode: responseData.data.error
        ? responseData.data.error
        : undefined, // data.error in payment API res
      invoiceRef: this.generateRef(),
      payment: transactionData.payment,
      paymentMethod: transactionData.paymentMethod,
      paymentMethodNumber: transactionData.paymentMethodNumber,
      paymentWithTaxes: transactionData.paymentWithTaxes, // as 'amount' in payment API req/re
      reqStatus: responseData.data.state
        ? responseData.data.state
        : ReqStatus.ERROR, // as data.state in payment API res
      taxes: transactionData.taxes,
      taxesAmount: transactionData.taxesAmount,
      tickets: transactionData.tickets,
      eventId: transactionData.eventId,
      categoryId: transactionData.categoryId,
      userId: userData._id,
      usermail: userData.email,
      userName: transactionData.userName,
      userPhone: userData.phone,
      type: transactionData.type ? transactionData.type : 'deposite',
      moneyCode: responseData.data.moneyCode
        ? responseData.data.moneyCode
        : 'XAF', // as data.moneyCode in payment API req/res
      titled: responseData.data.raison
        ? responseData.data.raison
        : 'Ticket - Yabi Events', // as data.raison in payment API req/res
      paymentMode: transactionData.paymentMethod, // In payment API req/res
      token: responseData.data.token ? responseData.data.token : '', // In payment API res
      ref: responseData.data.ref ? responseData.data.ref : '', // In payment API res
      message: responseData.data.message
        ? responseData.data.message
        : responseData.message,
    };
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

    if (!transaction) throw new NotFoundException('Invalid transaction ID');

    return transaction;
  }

  isPastDateTime(dateStr: string): boolean {
    const targetDateTime = new Date(`${dateStr}`);
    const currentDateTime = new Date();
    return targetDateTime > currentDateTime;
  }

  @Cron('*/15 * * * * *') // toutes les 15 secondes
  async processPendingTransactions() {
    // Si ReqStatus.PENDING ne correspond pas à la valeur attendue, utiliser la chaîne littérale
    const pendingStatus =
      typeof ReqStatus.PENDING === 'string' &&
      ReqStatus.PENDING.toLowerCase().includes('pending')
        ? ReqStatus.PENDING
        : 'financial_transaction_pending';
    const pendingTransactions = await this.transactionModel
      .find({ reqStatus: pendingStatus })
      .populate('userId')
      .exec();

    this.logger.log(
      `Nombre de transactions en attente : ${pendingTransactions.length}`,
    );
    await Promise.all(
      pendingTransactions.map(async (transaction: any) => {
        try {
          // handleTransactionStatePending doit être idempotente !
          await this.handleTransactionStatePending(
            transaction,
            transaction.userId,
          );
        } catch (err) {
          this.logger.error(
            `Erreur sur la transaction ${String(transaction._id)}: ${err}`,
          );
        }
      }),
    );
  }
}
