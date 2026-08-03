/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */

/* eslint-disable @typescript-eslint/no-unsafe-argument */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  Logger,
  HttpException,
  HttpStatus,
  // UnauthorizedException,
} from '@nestjs/common';
import { TStatus } from './transaction.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Transaction } from './transaction.schema';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { Payout } from 'src/payout/payout.schema';
import { PayinService } from 'src/payin/payin.service';
import { UpdateTransactionDto } from './update-transaction.dto';
import { SystemService } from 'src/system/system.service';
import { OperationNotificationService } from 'src/notification/operation-notification.service';
import { PaymentRequestService } from 'src/payment-request/payment-request.service';
import { PaymentRequestStatus } from 'src/payment-request/payment-request.schema';
import { ServicePaymentService } from 'src/service/service-payment/service-payment.service';
import { BalanceService } from 'src/balance/balance.service';
import { GatewayLoaderService } from 'src/payment/gateway-loader.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { SystemBalanceService } from 'src/system-balance/system-balance.service';

/** Allowed previous statuses for each target status (empty = terminal / no overwrite). */
const TRANSACTION_STATUS_FROM: Record<TStatus, TStatus[]> = {
  [TStatus.INITIALIZED]: [TStatus.INITIALIZED],
  [TStatus.PAYINPENDING]: [TStatus.INITIALIZED, TStatus.PAYINPENDING],
  [TStatus.PAYINSUCCESS]: [
    TStatus.INITIALIZED,
    TStatus.PAYINPENDING,
    TStatus.PAYINERROR,
    TStatus.PAYINCLOSED,
  ],
  [TStatus.PAYINERROR]: [
    TStatus.INITIALIZED,
    TStatus.PAYINPENDING,
    TStatus.PAYINERROR,
  ],
  [TStatus.PAYINCLOSED]: [
    TStatus.INITIALIZED,
    TStatus.PAYINPENDING,
    TStatus.PAYINCLOSED,
  ],
  [TStatus.PAYOUTPENDING]: [
    TStatus.PAYINSUCCESS,
    TStatus.PAYOUTPENDING,
    TStatus.PAYOUTERROR,
  ],
  [TStatus.PAYOUTSUCCESS]: [TStatus.PAYOUTPENDING],
  [TStatus.PAYOUTERROR]: [TStatus.PAYOUTPENDING],
  [TStatus.PAYOUTCLOSED]: [TStatus.PAYOUTPENDING, TStatus.PAYOUTERROR],
  [TStatus.PAYOUTREJECTED]: [TStatus.PAYINSUCCESS],
  [TStatus.ERROR]: [TStatus.INITIALIZED, TStatus.PAYINPENDING],
  [TStatus.SUCCESS]: [TStatus.PAYINSUCCESS, TStatus.PAYOUTSUCCESS],
};

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
    private payinService: PayinService,
    private systemService: SystemService,
    private operationNotificationService: OperationNotificationService,
    @Inject(forwardRef(() => PaymentRequestService))
    private paymentRequestService: PaymentRequestService,
    private servicePaymentService: ServicePaymentService,
    private balanceService: BalanceService,
    private gatewayLoader: GatewayLoaderService,
    @Inject(forwardRef(() => FlutterwaveService))
    private flutterwaveService: FlutterwaveService,
    private auditLogService: AuditLogService,
    private systemBalanceService: SystemBalanceService,
  ) { }

  private async loadFwSecret(currency = 'XAF'): Promise<string> {
    try {
      const gwConfig = await this.gatewayLoader.getConfig(currency);
      const secret = gwConfig?.credentials?.FLUTTERWAVE_SECRET_KEY || gwConfig?.credentials?.secretKey || '';
      if (secret) return secret;
    } catch {
      this.logger.warn(`loadFwSecret: failed to load credentials for ${currency}`);
    }
    return '';
  }

  async findAll(query: Query): Promise<Transaction[]> {
    const requestedLimit = Number((query as any)?.limit || (query as any)?.resPerPage);
    const resPerPage = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const searchKeyword = typeof query.keyword === 'string' ? query.keyword : '';
    const keyword = searchKeyword ? this.buildKeywordFilter(searchKeyword) : {};
    const transactions = await this.transactionModel
      .find({ ...keyword })
      .select(this.listProjection)
      .limit(resPerPage)
      .sort({ createdAt: -1 }) // Sort recent to old
      .skip(skip)
      .lean();
    return transactions;
  }

  private buildKeywordFilter(keyword?: string): any {
    if (!keyword) return {};

    const conditions: any[] = [
      { transactionRef: { $regex: keyword, $options: 'i' } },
      { txRef: { $regex: keyword, $options: 'i' } },
      { senderName: { $regex: keyword, $options: 'i' } },
      { receiverName: { $regex: keyword, $options: 'i' } },
    ];

    if (mongoose.Types.ObjectId.isValid(keyword)) {
      conditions.push({ _id: new mongoose.Types.ObjectId(keyword) });
    }

    return { $or: conditions };
  }

  private buildStatusFilter(status?: string): any {
    if (!status) return null;
    const statusGroups: Record<string, string[]> = {
      pending: ['transaction_initialized', 'transaction_payin_pending', 'transaction_payout_pending'],
      success: ['transaction_payin_success', 'transaction_payout_success'],
      failed: ['transaction_payin_error', 'transaction_payin_closed', 'transaction_payout_error', 'transaction_payout_closed', 'transaction_payout_rejected', 'transaction_error'],
    };
    const group = statusGroups[status];
    if (group) return { status: { $in: group } };
    return { status };
  }

  private apiPayoutMatch(): any {
    return { isApiPayout: true };
  }

  private withdrawalPayoutMatch(): any {
    return {
      $or: [
        { transactionType: 'withdrawal' },
        { transactionType: 'systemWithdrawal' },
        this.apiPayoutMatch(),
      ],
    };
  }

  private payoutTransactionMatch(): any {
    return {
      $or: [{ transactionType: 'transfer' }, this.withdrawalPayoutMatch()],
    };
  }

  async getAllPayoutTransactoins(query: Query): Promise<Transaction[]> {
    const resPerPage = Number(query?.limit || query?.resPerPage) || 10;
    const currentPage = Number(query?.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keywordFilter = typeof query.keyword === 'string' ? this.buildKeywordFilter(query.keyword) : {};

    const res = await this.transactionModel.aggregate([
      {
        $match: {
          $and: [
            this.payoutTransactionMatch(),
            keywordFilter,
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

    const userFilter = {
      $or: [
        { receiverId: userId },
        { senderId: userObjectId },
        { userId: userObjectId },
      ],
    };

    const keywordFilter = typeof query.keyword === 'string' ? this.buildKeywordFilter(query.keyword) : {};
    const statusFilter = this.buildStatusFilter(query.status);
    const conditions: any[] = [userFilter];
    if (Object.keys(keywordFilter).length) conditions.push(keywordFilter);
    if (statusFilter) conditions.push(statusFilter);
    const matchFilter = conditions.length === 1 ? conditions[0] : { $and: conditions };

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

  async getApiCallTransactions(
    userId: string,
    query: {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
      status?: string;
      type?: 'payin' | 'payout';
    },
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = Number(query.limit);
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 10;
    const skip = (page - 1) * limit;

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const matchFilter: any = {
      $and: [
        { transactionType: 'apiCall' },
        {
          $or: [
            { receiverId: userId },
            { senderId: userObjectId },
            { userId: userObjectId },
          ],
        },
      ],
    };

    if (query.startDate || query.endDate) {
      const dateFilter: any = {};
      if (query.startDate) dateFilter.$gte = new Date(query.startDate);
      if (query.endDate) dateFilter.$lte = new Date(query.endDate);
      matchFilter.$and.push({ createdAt: dateFilter });
    }

    if (query.status) {
      const statusMap: Record<string, string> = {
        payin_pending: 'transaction_payin_pending',
        payin_success: 'transaction_payin_success',
        payin_error: 'transaction_payin_error',
        payin_closed: 'transaction_payin_closed',
        payout_pending: 'transaction_payout_pending',
        payout_success: 'transaction_payout_success',
        payout_error: 'transaction_payout_error',
        payout_closed: 'transaction_payout_closed',
        payout_rejected: 'transaction_payout_rejected',
      };
      const internalStatus = statusMap[query.status];
      if (internalStatus) {
        matchFilter.$and.push({ status: internalStatus });
      }
    }

    if (query.type === 'payin') {
      matchFilter.$and.push({
        status: {
          $in: [
            'transaction_payin_pending', 'transaction_payin_success',
            'transaction_payin_error', 'transaction_payin_closed',
          ],
        },
      });
    } else if (query.type === 'payout') {
      matchFilter.$and.push({
        $or: [
          { status: { $in: [
            'transaction_payout_pending', 'transaction_payout_success',
            'transaction_payout_error', 'transaction_payout_closed',
            'transaction_payout_rejected',
          ] } },
          { isApiPayout: true },
        ],
      });
    }

    const aggregated = await this.transactionModel.aggregate([
      { $match: matchFilter },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            { $project: { raw: 0, message: 0, token: 0, reqErrorCode: 0, reqStatusCode: 0 } },
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

    const withdrawalLikeMatch = this.payoutTransactionMatch();

    let matchCondition: any = { ...withdrawalLikeMatch };

    switch (status) {
      case 'rejected':
        matchCondition = {
          $and: [
            {
              status: {
                $in: [
                  TStatus.PAYOUTREJECTED,
                  'transaction_payin_rejected',
                ],
              },
            },
            withdrawalLikeMatch,
          ],
        };
        break;

      case 'accepted':
        matchCondition = {
          $and: [
            { status: 'transaction_payout_success' },
            withdrawalLikeMatch,
          ],
        };
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
            withdrawalLikeMatch,
          ],
        };
        break;

      case 'error':
        matchCondition = {
          $and: [
            {
              status: {
                $in: [
                  'transaction_payout_error',
                  'transaction_payin_error',
                ],
              },
            },
            withdrawalLikeMatch,
          ],
        };
        break;

      default:
        matchCondition = {
          $and: [
            { status: 'transaction_payin_success' },
            withdrawalLikeMatch,
          ],
        };
        break;
    }

    const statusKeyword = typeof query?.keyword === 'string' ? query.keyword : '';
    if (statusKeyword) {
      matchCondition = {
        $and: [matchCondition, this.buildKeywordFilter(statusKeyword)],
      };
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

  async investigateBalanceByReceiver(userId: string): Promise<{
    userId: string;
    balance: number;
  }> {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
      throw new NotFoundException('Invalid user ID');
    }

    const creditTypes = [
      'fundraising',
      'service',
      'payment',
      'subscription',
      'apiCall',
      'deposit',
      'transfer',
      'paymentRequest',
    ];

    const aggregated = await this.transactionModel.aggregate([
      {
        $addFields: {
          receiverIdStr: { $toString: '$receiverId' },
          estimationNum: {
            $convert: {
              input: '$estimation',
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      {
        $match: {
          receiverIdStr: normalizedUserId,
        },
      },
      {
        $group: {
          _id: null,
          creditTotal: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$transactionType', creditTypes] },
                    { $eq: ['$status', TStatus.PAYINSUCCESS] },
                  ],
                },
                '$estimationNum',
                0,
              ],
            },
          },
          debitTotal: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $or: [
                        { $eq: ['$transactionType', 'withdrawal'] },
                        { $eq: ['$isApiPayout', true] },
                      ],
                    },
                    { $eq: ['$status', TStatus.PAYOUTSUCCESS] },
                  ],
                },
                '$estimationNum',
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          balance: { $subtract: ['$creditTotal', '$debitTotal'] },
        },
      },
    ]);

    const balance = Number(aggregated?.[0]?.balance || 0);
    return {
      userId: normalizedUserId,
      balance,
    };
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
              $or: [
                { transactionType: { $in: ['transfer', 'withdrawal'] } },
                { isApiPayout: true },
              ],
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

  async getInitializedPendingList(query?): Promise<any> {
    const resPerPage = Number(query?.resPerPage) || 10;
    const currentPage = Number(query?.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const eightHoursAgo = new Date();
    eightHoursAgo.setMinutes(eightHoursAgo.getMinutes() - 480);

    return this.transactionModel.aggregate([
      {
        $match: {
          $and: [
            { status: 'transaction_initialized' },
            { updatedAt: { $lt: eightHoursAgo } },
          ],
        },
      },
      { $skip: skip },
      { $limit: resPerPage },
    ]);
  }

  async getPayinByTxRef(txRef: string) {
    return this.payoutModel.findOne({ txRef }).lean().exec();
  }

  async verifyTransactionPayinStatus(transactionData: any) {
    let payin: any = await this.payinService.getPayinByTxRef(transactionData.txRef);
    if (!payin) {
      payin = await this.payinService.getPayinByTransactionId(transactionData._id);
      if (!payin) {
        return this.updateTransactionStatus(
          transactionData._id,
          TStatus.PAYINERROR,
        );
      }
    }
    if (payin.status === 'successful' || payin.status === 'SUCCESSFUL') {
      // Full finalize path (claim + credit + handlers) — multi-instance safe
      await this.flutterwaveService.processSuccessfulPayin(
        transactionData,
        String(transactionData._id),
      );
      return this.transactionModel.findById(transactionData._id);
    } else if (payin.status === 'cancelled' || payin.status === 'CANCELLED') {
      if (transactionData?.transactionType === 'paymentRequest') {
        await this.paymentRequestService.updatePaymentRequestStatusByTransaction(
          String(transactionData._id),
          PaymentRequestStatus.CANCELED,
        );
      }
      return this.updateTransactionStatus(
        transactionData._id,
        TStatus.PAYINCLOSED,
      );
    } else if (payin.status === 'failed' || payin.status === 'FAILED') {
      if (transactionData?.transactionType === 'paymentRequest') {
        await this.paymentRequestService.updatePaymentRequestStatusByTransaction(
          String(transactionData._id),
          PaymentRequestStatus.FAILED,
        );
      }
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
    if (transaction.userId) {
      transaction.userId.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
      transaction.userId.password = ''; // Remove the password from the response for security
    }

    return transaction;
  }

  /**
   * Recherche une transaction à partir de son `transactionRef` (référence
   * lisible générée à la création, indexée). Utilisé par les consommateurs
   * externes (Eat) qui préfèrent référencer la transaction par sa ref plutôt
   * que par son `_id` Mongo.
   */
  async findByTransactionRef(transactionRef: string): Promise<any> {
    const ref = String(transactionRef || '').trim();
    if (!ref) throw new NotFoundException('Invalid transactionRef');
    const transaction: any = await this.transactionModel
      .findOne({ transactionRef: ref })
      .populate('userId');
    if (!transaction) {
      throw new NotFoundException('transaction not found');
    }
    if (transaction.userId) {
      transaction.userId.resetPasswordToken = '';
      transaction.userId.password = '';
    }
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
    let payout: any = await this.getPayoutByTxRef(transactionData.txRef);
    if (!payout) {
      payout = await this.getPayout(transactionData.txRef);
      if (!payout) {
        console.log(`[TransactionCron] tx=${transactionData.txRef} → aucun payout trouvé, fermeture`);
        return this.updateTransactionStatus(
          transactionData._id,
          TStatus.PAYOUTCLOSED,
        );
      }
    }

    console.log(`[TransactionCron] tx=${transactionData.txRef} → payout trouvé status=${payout.status} flwTxId=${payout.flwTxId || payout.raw?.id} reference=${payout.reference}`);

    // Statut terminal : mettre à jour la transaction
    if (payout.status === 'SUCCESSFUL') {
      console.log(`[TransactionCron] → PAYOUTSUCCESS`);
      return this.updateTransactionStatus(transactionData._id, TStatus.PAYOUTSUCCESS);
    }
    if (payout.status === 'FAILED') {
      console.log(`[TransactionCron] → PAYOUTERROR`);
      return this.updateTransactionStatus(transactionData._id, TStatus.PAYOUTERROR);
    }

    // Paiements non-Flutterwave (Paystack/M-Pesa) : pas de vérification FW possible
    const provider = String(payout?.provider || 'flutterwave').toLowerCase();
    if (provider !== 'flutterwave') {
      console.log(`[TransactionCron] → provider="${provider}" non pris en charge par la vérification FW`);
      return false;
    }

    // Statut non terminal : vérifier directement chez Flutterwave
    console.log(`[TransactionCron] → statut local "${payout.status}" non terminal, vérification FW...`);
    const fwFlwTxId = payout.flwTxId || payout.raw?.data?.id || payout.raw?.id;
    const fwSecret = await this.loadFwSecret(transactionData?.receiverCurrency || transactionData?.senderCurrency || 'XAF');
    if (!fwSecret) {
      console.log(`[TransactionCron] → aucune clé FW trouvée en base`);
      return false;
    }
    const authHeader = { Authorization: `Bearer ${fwSecret}` };
    const fwBaseUrl = 'https://api.flutterwave.com/v3';
    let fwStatus: string | null = null;

    if (fwFlwTxId) {
      try {
        const resp: any = await firstValueFrom(
          this.httpService.get(`${fwBaseUrl}/transfers/${fwFlwTxId}`, {
            headers: authHeader,
          }),
        );
        fwStatus = resp?.data?.data?.status;
        console.log(`[TransactionCron] → FW numeric ID ${fwFlwTxId} → status=${fwStatus}`);
      } catch { /* ignore */ }
    }

    if (!fwStatus) {
      try {
        const resp: any = await firstValueFrom(
          this.httpService.get(`${fwBaseUrl}/transfers`, {
            headers: authHeader,
            params: { reference: payout.reference },
          }),
        );
        const data = resp?.data?.data;
        fwStatus = Array.isArray(data) && data.length > 0 ? data[0].status : data?.status;
        console.log(`[TransactionCron] → FW reference fallback → status=${fwStatus}`);
      } catch { /* ignore */ }
    }

    if (!fwStatus) {
      console.log(`[TransactionCron] → pas de statut FW, abandon`);
      return false;
    }

    if (fwStatus === 'SUCCESSFUL') {
      console.log(`[TransactionCron] → FW dit SUCCESSFUL, mise à jour payout + transaction`);
      await this.payoutModel
        .findOneAndUpdate(
          {
            _id: payout._id,
            status: { $nin: ['SUCCESSFUL'] },
          },
          { status: 'SUCCESSFUL' },
        )
        .exec();
      return this.updateTransactionStatus(transactionData._id, TStatus.PAYOUTSUCCESS);
    }
    if (fwStatus === 'FAILED') {
      console.log(`[TransactionCron] → FW dit FAILED, mise à jour payout + transaction`);
      await this.payoutModel
        .findOneAndUpdate(
          {
            _id: payout._id,
            status: { $nin: ['SUCCESSFUL', 'FAILED'] },
          },
          { status: 'FAILED' },
        )
        .exec();
      return this.updateTransactionStatus(transactionData._id, TStatus.PAYOUTERROR);
    }

    // FW toujours en statut intermédiaire (NEW/PENDING/QUEUED)
    console.log(`[TransactionCron] → FW toujours "${fwStatus}", pas de changement`);
    return false;
  }

  async updateTransactionStatus(
    transactionId: string,
    status: TStatus,
    raw?: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }

    const allowedFrom = TRANSACTION_STATUS_FROM[status] || [];
    // Only transition from allowed prior statuses (and never rewrite same status)
    const statusFilter =
      allowedFrom.length > 0
        ? { status: { $in: allowedFrom.filter((s) => s !== status) } }
        : { status: { $ne: status } };

    const transactionBefore = await this.transactionModel.findById(transactionId).lean();
    const previousStatus: TStatus | undefined = transactionBefore?.status;

    const update: Record<string, any> = raw
      ? { status, raw, $push: { statusChanges: { from: previousStatus, to: status, timestamp: new Date(), triggeredBy: 'system' } } }
      : { status, $push: { statusChanges: { from: previousStatus, to: status, timestamp: new Date(), triggeredBy: 'system' } } };
    let transaction: any = await this.transactionModel.findOneAndUpdate(
      { _id: transactionId, ...statusFilter },
      update,
      { new: true },
    );

    if (!transaction) {
      const existing = await this.transactionModel.findById(transactionId);
      if (!existing) throw new NotFoundException('Transaction not found');
      // Already at target status or illegal transition — idempotent no-op
      return existing;
    }

    void this.auditLogService.record({
      action: `transaction.status.${status}`,
      resourceType: 'transaction',
      resourceId: transactionId,
      metadata: { from: previousStatus, to: status, raw: raw ? 'present' : undefined },
    });

    if (status === TStatus.PAYOUTERROR) {
      await this.refundFailedOutgoingPayoutIfNeeded(transaction);
      transaction = await this.transactionModel.findById(transactionId);
    }
    if (
      status === TStatus.PAYOUTREJECTED ||
      status === ('transaction_payin_rejected' as any)
    ) {
      void this.operationNotificationService
        .notifyRejectedTransaction(transaction)
        .catch((error) =>
          console.error('notifyRejectedTransaction failed:', error),
        );
    }
    if (transaction.transactionType === 'apiCall' && transaction.callbackUrl) {
      void this.sendCallback(transaction).catch((error) =>
        console.error('sendCallback failed:', error),
      );
    }
    return transaction;
  }

  private async refundFailedOutgoingPayoutIfNeeded(transaction: any): Promise<void> {
    const transactionType = String(transaction?.transactionType || '');

    // Retrait du solde système : recréditer le solde système (et non un user)
    // puis notifier les admins par email + WhatsApp en cas d'échec.
    if (transactionType === 'systemWithdrawal') {
      const refunded = await this.refundSystemBalanceIfNeeded(transaction);
      if (refunded) {
        void this.operationNotificationService
          .notifyAdminPayoutFailed(transaction)
          .catch((error) =>
            console.error('notifyAdminPayoutFailed (system) failed:', error),
          );
      }
      return;
    }

    const refundableTypes = ['withdrawal', 'apiCall', 'transfer'];
    if (!refundableTypes.includes(transactionType)) return;

    const refund = this.getPayoutFailureRefundDetails(transaction);
    if (!refund) {
      this.logger.warn(
        `Payout failure refund skipped: invalid refund details for transaction ${String(transaction?._id)}`,
      );
      return;
    }

    const marked = await this.transactionModel.findOneAndUpdate(
      {
        _id: transaction._id,
        payoutFailureRefundedAt: { $exists: false },
      },
      {
        $set: {
          payoutFailureRefundedAt: new Date(),
          payoutFailureRefundAmount: String(refund.amount),
          payoutFailureRefundCurrency: refund.currency,
          payoutFailureRefundUserId: refund.userId,
        },
      },
      { new: true },
    );

    if (!marked) return;

    try {
      await this.balanceService.creditBalance(
        refund.userId,
        refund.amount,
        refund.currency,
        `payout-failure-refund:${String(transaction._id)}`,
      );
    } catch (error) {
      await this.transactionModel.updateOne(
        { _id: transaction._id },
        {
          $unset: {
            payoutFailureRefundedAt: '',
            payoutFailureRefundAmount: '',
            payoutFailureRefundCurrency: '',
            payoutFailureRefundUserId: '',
          },
        },
      );
      throw error;
    }
  }

  /**
   * Recrédite le solde système d'un retrait système (échec ou rejet).
   * Idempotent : ne crédite qu'une seule fois (marqueur payoutFailureRefundedAt).
   * Retourne `true` si le recrédit vient d'être effectué, sinon `false`.
   */
  private async refundSystemBalanceIfNeeded(transaction: any): Promise<boolean> {
    if (String(transaction?.transactionType || '') !== 'systemWithdrawal') {
      return false;
    }
    const amount = Number(transaction?.estimation);
    const currency =
      transaction?.receiverCurrency || transaction?.senderCurrency || 'XAF';
    if (!Number.isFinite(amount) || amount <= 0) {
      this.logger.warn(
        `System withdrawal refund skipped: invalid amount (${amount}) for ${String(transaction?._id)}`,
      );
      return false;
    }

    const marked = await this.transactionModel.findOneAndUpdate(
      {
        _id: transaction._id,
        payoutFailureRefundedAt: { $exists: false },
      },
      {
        $set: {
          payoutFailureRefundedAt: new Date(),
          payoutFailureRefundAmount: String(amount),
          payoutFailureRefundCurrency: currency,
          payoutFailureRefundUserId: 'system',
        },
      },
      { new: true },
    );
    if (!marked) return false;

    try {
      await this.systemBalanceService.creditSystemBalance(
        currency,
        amount,
        `system-payout-failure-refund:${String(transaction._id)}`,
        {
          reference: transaction?.txRef || String(transaction._id),
          description: 'Recrédit du solde système (retrait échoué)',
        },
      );
      return true;
    } catch (error) {
      await this.transactionModel.updateOne(
        { _id: transaction._id },
        {
          $unset: {
            payoutFailureRefundedAt: '',
            payoutFailureRefundAmount: '',
            payoutFailureRefundCurrency: '',
            payoutFailureRefundUserId: '',
          },
        },
      );
      throw error;
    }
  }

  private getPayoutFailureRefundDetails(transaction: any): {
    userId: string;
    amount: number;
    currency: string;
  } | null {
    const transactionType = String(transaction?.transactionType || '');
    const senderId = this.toIdString(transaction?.senderId || transaction?.userId);
    const receiverId = this.toIdString(transaction?.receiverId || transaction?.userId);

    if (transactionType === 'transfer') {
      return this.buildRefundDetails(
        senderId,
        transaction?.paymentWithTaxes,
        transaction?.senderCurrency,
      );
    }

    return this.buildRefundDetails(
      senderId || receiverId,
      transaction?.estimation,
      transaction?.senderCurrency || transaction?.receiverCurrency,
    );
  }

  private buildRefundDetails(
    userId: string | undefined,
    amountValue: any,
    currencyValue: any,
  ): { userId: string; amount: number; currency: string } | null {
    const amount = Number(amountValue);
    const currency = String(currencyValue || '').trim();
    if (!userId || !Number.isFinite(amount) || amount <= 0 || !currency) {
      return null;
    }
    return { userId, amount, currency };
  }

  private toIdString(value: any): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (value?._id) return value._id?.toString?.() || String(value._id);
    return value?.toString?.();
  }

  async reclaimPayoutFailureRefundForRetry(transactionId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }

    const transaction: any = await this.transactionModel.findById(transactionId);
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (!transaction.payoutFailureRefundedAt) return false;

    const refundUserId = String(transaction.payoutFailureRefundUserId || '');
    const refundAmount = Number(transaction.payoutFailureRefundAmount);
    const refundCurrency = String(transaction.payoutFailureRefundCurrency || '');

    if (!refundUserId || !Number.isFinite(refundAmount) || refundAmount <= 0 || !refundCurrency) {
      throw new NotFoundException('Invalid payout failure refund data');
    }

    await this.balanceService.debitBalance(
      refundUserId,
      refundAmount,
      refundCurrency,
      `payout-failure-reclaim:${String(transactionId)}:${Date.now()}`,
    );
    await this.transactionModel.updateOne(
      { _id: transactionId },
      {
        $unset: {
          payoutFailureRefundedAt: '',
          payoutFailureRefundAmount: '',
          payoutFailureRefundCurrency: '',
          payoutFailureRefundUserId: '',
        },
      },
    );

    return true;
  }

  private async sendCallback(transaction: any): Promise<void> {
    if (!transaction?.callbackUrl) return;

    const statusMap: Record<string, string> = {
      transaction_payin_pending: 'payin_pending',
      transaction_payin_success: 'payin_success',
      transaction_payin_error: 'payin_error',
      transaction_payin_closed: 'payin_closed',
      transaction_payin_rejected: 'payin_rejected',
      transaction_payout_pending: 'payout_pending',
      transaction_payout_success: 'payout_success',
      transaction_payout_error: 'payout_error',
      transaction_payout_closed: 'payout_closed',
      transaction_payout_rejected: 'payout_rejected',
    };
    const mappedStatus = statusMap[transaction.status] ?? transaction.status;

    // Claim callback for this status once across instances
    const claimed = await this.transactionModel
      .findOneAndUpdate(
        {
          _id: transaction._id,
          $or: [
            { lastCallbackStatus: { $exists: false } },
            { lastCallbackStatus: null },
            { lastCallbackStatus: { $ne: mappedStatus } },
          ],
        },
        { $set: { lastCallbackStatus: mappedStatus } },
        { new: true },
      )
      .exec();

    if (!claimed) {
      return;
    }

    const payload = {
      id: transaction._id,
      status: mappedStatus,
      data: {
        estimation: transaction.estimation,
        transactionRef: transaction.transactionRef,
        invoiceTaxes: transaction.taxesAmount,
        paymentWithTaxes: transaction.paymentWithTaxes,
        raisonForTransfer: transaction.raisonForTransfer,
        receiverCurrency: transaction.receiverCurrency,
        transactionType: transaction.transactionType,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      },
    };
    try {
      await this.httpService.axiosRef.post(transaction.callbackUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'digiKUNTZ-Payments-Webhook/1.0',
        },
      });
    } catch (error) {
      // Allow a later retry for the same status if delivery failed
      await this.transactionModel
        .updateOne(
          { _id: transaction._id, lastCallbackStatus: mappedStatus },
          { $unset: { lastCallbackStatus: '' } },
        )
        .exec()
        .catch(() => undefined);
      throw error;
    }
  }

  async claimTransactionForPayout(transactionId: string): Promise<any | null> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }

    const transaction = await this.transactionModel
      .findOneAndUpdate(
        { _id: transactionId, status: TStatus.PAYINSUCCESS },
        { status: TStatus.PAYOUTPENDING },
        { new: true },
      )
      .exec();

    if (transaction?.transactionType === 'apiCall' && transaction?.callbackUrl) {
      void this.sendCallback(transaction).catch((error) =>
        console.error('sendCallback failed (claimTransactionForPayout):', error),
      );
    }

    return transaction;
  }

  async rejectPayoutTransaction(transactionId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }

    const transaction: any = await this.transactionModel
      .findOneAndUpdate(
        {
          _id: transactionId,
          status: TStatus.PAYINSUCCESS,
          ...this.payoutTransactionMatch(),
        },
        { status: TStatus.PAYOUTREJECTED },
        { new: true },
      )
      .exec();

    if (!transaction) {
      throw new NotFoundException(
        'Transaction not found or not eligible for rejection',
      );
    }

    await this.refundRejectedOutgoingPayoutIfNeeded(transaction);

    void this.operationNotificationService
      .notifyRejectedTransaction(transaction)
      .catch((error) =>
        console.error('notifyRejectedTransaction failed:', error),
      );

    if (transaction.transactionType === 'apiCall' && transaction.callbackUrl) {
      void this.sendCallback(transaction).catch((error) =>
        console.error('sendCallback failed:', error),
      );
    }

    return this.transactionModel.findById(transactionId).lean().exec();
  }

  private async refundRejectedOutgoingPayoutIfNeeded(transaction: any): Promise<void> {
    // Retrait du solde système rejeté : recréditer le solde système.
    if (String(transaction?.transactionType || '') === 'systemWithdrawal') {
      await this.refundSystemBalanceIfNeeded(transaction);
      return;
    }

    const refund = this.getRejectedPayoutRefundDetails(transaction);
    if (!refund) return;

    const marked = await this.transactionModel.findOneAndUpdate(
      {
        _id: transaction._id,
        payoutFailureRefundedAt: { $exists: false },
      },
      {
        $set: {
          payoutFailureRefundedAt: new Date(),
          payoutFailureRefundAmount: String(refund.amount),
          payoutFailureRefundCurrency: refund.currency,
          payoutFailureRefundUserId: refund.userId,
        },
      },
      { new: true },
    );

    if (!marked) return;

    try {
      await this.balanceService.creditBalance(
        refund.userId,
        refund.amount,
        refund.currency,
        `payout-failure-refund:${String(transaction._id)}`,
      );
    } catch (error) {
      await this.transactionModel.updateOne(
        { _id: transaction._id },
        {
          $unset: {
            payoutFailureRefundedAt: '',
            payoutFailureRefundAmount: '',
            payoutFailureRefundCurrency: '',
            payoutFailureRefundUserId: '',
          },
        },
      );
      throw error;
    }
  }

  private getRejectedPayoutRefundDetails(transaction: any): {
    userId: string;
    amount: number;
    currency: string;
  } | null {
    const senderId = this.toIdString(transaction?.senderId || transaction?.userId);
    const receiverId = this.toIdString(transaction?.receiverId || transaction?.userId);
    const transactionType = String(transaction?.transactionType || '');

    if (transactionType === 'transfer') {
      return this.buildRefundDetails(
        senderId,
        transaction?.paymentWithTaxes,
        transaction?.senderCurrency,
      );
    }

    return this.buildRefundDetails(
      senderId || receiverId,
      transaction?.estimation,
      transaction?.senderCurrency || transaction?.receiverCurrency,
    );
  }

  async claimTransactionForSuccessfulPayin(
    transactionId: string,
  ): Promise<any | null> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }

    return this.transactionModel
      .findOneAndUpdate(
        {
          _id: transactionId,
          status: {
            $in: [
              TStatus.PAYINPENDING,
              TStatus.INITIALIZED,
              TStatus.PAYINERROR,
              TStatus.PAYINCLOSED,
            ],
          },
        },
        { status: TStatus.PAYINSUCCESS },
        { new: true },
      )
      .exec();
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

  async updateTransactionFlwTxId(
    transactionId: string,
    flwTxId: string,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Invalid transaction ID');
    }
    const transaction: any = await this.transactionModel.findByIdAndUpdate(
        transactionId,
        { flwTxId },
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
    const noFees =
      transactionData?.noFees === true ||
      transactionData?.transactionType === 'withdrawal' ||
      (
        transactionData?.transactionType === 'apiCall' &&
        transactionData?.status === TStatus.PAYINSUCCESS
      );
    const taxesDetails = noFees
      ? {
          invoiceTaxes: 0,
          taxesAmount: 0,
          paymentWithTaxes: this.arrondOnExeed(Number(transactionData.estimation)),
        }
      : await this.calculateTaxesAmount(
          transactionData.estimation,
          Number(transactionData.invoiceTaxes) || undefined,
        );
    const { noFees: _noFees, ...persistedTransactionData } = transactionData;
    const payload = {
      ...persistedTransactionData,
      estimation: String(transactionData.estimation),
      receiverAmount: transactionData.transactionType === 'transfer' ? String(transactionData.receiverAmount) : String(transactionData.estimation),
      invoiceTaxes: String(taxesDetails.invoiceTaxes),
      taxesAmount: String(taxesDetails.taxesAmount),
      paymentWithTaxes: String(taxesDetails.paymentWithTaxes),
    };
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

  /**
   * Vérifie que le montant d'une transaction est dans les limites
   * min/max configurées dans les paramètres système pour la devise concernée.
   *
   * @param amount    - Montant de la transaction
   * @param currency  - Devise (XAF, EUR, USD, KES, etc.)
   * @param type      - Type de transaction : 'deposit' (encaissement) ou 'withdrawal' (retrait)
   * @returns         - `true` si la validation passe, ou lève une exception HttpException
   */
  async validateTransactionLimit(
    amount: number,
    currency: string,
    type: 'deposit' | 'withdrawal',
  ): Promise<boolean> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { message: 'Invalid transaction amount' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const systemData = await this.systemService.getSystemData();
    const limits = systemData?.transactionLimits || [];

    const currencyLimit = limits.find(
      (l: any) => String(l.currency || '').toUpperCase() === String(currency || '').toUpperCase(),
    );

    if (!currencyLimit) {
      // Pas de limite configurée pour cette devise → autorisé
      return true;
    }

    if (type === 'deposit') {
      const min = Number(currencyLimit.minDeposit);
      const max = Number(currencyLimit.maxDeposit);

      if (Number.isFinite(min) && min > 0 && amount < min) {
        throw new HttpException(
          {
            message: `Minimum deposit amount is ${min} ${currency}`,
            code: 'AMOUNT_BELOW_MINIMUM',
            minAmount: min,
            currency,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (Number.isFinite(max) && max > 0 && amount > max) {
        throw new HttpException(
          {
            message: `Maximum deposit amount is ${max} ${currency}`,
            code: 'AMOUNT_EXCEEDS_MAXIMUM',
            maxAmount: max,
            currency,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (type === 'withdrawal') {
      const min = Number(currencyLimit.minWithdrawal);
      const max = Number(currencyLimit.maxWithdrawal);

      if (Number.isFinite(min) && min > 0 && amount < min) {
        throw new HttpException(
          {
            message: `Minimum withdrawal amount is ${min} ${currency}`,
            code: 'AMOUNT_BELOW_MINIMUM',
            minAmount: min,
            currency,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (Number.isFinite(max) && max > 0 && amount > max) {
        throw new HttpException(
          {
            message: `Maximum withdrawal amount is ${max} ${currency}`,
            code: 'AMOUNT_EXCEEDS_MAXIMUM',
            maxAmount: max,
            currency,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return true;
  }

  async calculateTaxesAmount(price: number, taxRate?: number): Promise<any> {
    const rate = taxRate ?? (await this.systemService.getSystemData()).invoiceTaxes ?? 0;
    const taxesAmount = this.arrondOnExeed(price * (rate / 100));
    const paymentWithTaxes = this.arrondOnExeed(price + taxesAmount);
    return {
      invoiceTaxes: rate,
      price: this.arrondOnExeed(price),
      taxesAmount,
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
    return await this.transactionModel.countDocuments(
      this.withdrawalPayoutMatch(),
    );
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
      ...this.withdrawalPayoutMatch(),
    });
  }

  async getErrorTransferTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments(
      {
        status: { $in: ['transaction_payout_error', 'transaction_payin_error'] },
        transactionType: 'transfer',
      },
    );
  }

  async getErrorWithdrawalTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      status: { $in: ['transaction_payout_error', 'transaction_payin_error'] },
      ...this.withdrawalPayoutMatch(),
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
      ...this.withdrawalPayoutMatch(),
    });
  }

  async getRejectedTransferTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      status: {
        $in: [TStatus.PAYOUTREJECTED, 'transaction_payin_rejected'],
      },
      transactionType: 'transfer',
    });
  }

  async getRejectedWithdrawalTransaction(): Promise<number> {
    return await this.transactionModel.countDocuments({
      status: {
        $in: [TStatus.PAYOUTREJECTED, 'transaction_payin_rejected'],
      },
      ...this.withdrawalPayoutMatch(),
    });
  }
  // ---------------- / System statistic ------------------------

  // ------------------- User transactions statistic
  async getMyTransactionStats(userId: string): Promise<{
    total: number;
    success: number;
    pending: number;
    failed: number;
  }> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const userFilter = {
      $or: [
        { receiverId: userId },
        { senderId: userObjectId },
        { userId: userObjectId },
      ],
    };
    const [total, success, pending, failed] = await Promise.all([
      this.transactionModel.countDocuments(userFilter),
      this.transactionModel.countDocuments({
        ...userFilter,
        status: { $in: ['transaction_payin_success', 'transaction_payout_success'] },
      }),
      this.transactionModel.countDocuments({
        ...userFilter,
        status: { $in: ['transaction_initialized', 'transaction_payin_pending', 'transaction_payout_pending'] },
      }),
      this.transactionModel.countDocuments({
        ...userFilter,
        status: { $in: ['transaction_payin_error', 'transaction_payin_closed', 'transaction_payout_error', 'transaction_payout_closed', 'transaction_payout_rejected', 'transaction_error'] },
      }),
    ]);
    return { total, success, pending, failed };
  }

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

  async reconcileUserBalance(userId: string, onLog?: (message: string) => void): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const fwSecret = await this.loadFwSecret();
    if (!fwSecret) {
      throw new NotFoundException('No Flutterwave gateway credentials found in database');
    }
    const authHeader = { Authorization: `Bearer ${fwSecret}` };
    const fwBaseUrl = 'https://api.flutterwave.com/v3';

    const transactions = await this.transactionModel
      .find({
        $or: [
          { receiverId: userId },
          { senderId: userId },
          { userId },
        ],
        status: {
          $nin: [
            TStatus.PAYINPENDING,
            TStatus.INITIALIZED,
          ],
        },
      })
      .lean()
      .exec();

    const adjustments: any[] = [];
    let netAdjustment = 0;
    let checkedCount = 0;
    let discrepancyCount = 0;
    const log = (msg: string) => {
      console.log(msg);
      onLog?.(msg);
    };

    log(`[Reconcile] Début pour userId=${userId}, ${transactions.length} transactions à vérifier`);

    for (const tx of transactions) {
      const payinTypes = [
        'fundraising', 'service', 'payment', 'subscription',
        'deposit', 'transfer', 'paymentRequest',
      ];

      try {
        if (tx.transactionType === 'apiCall' && !tx.isApiPayout) {
          // Le payin peut stocker soit tx.txRef (txPayin-...) soit
          // tx.transactionRef (IN115#...) selon comment il a été créé.
          // Essayer les deux pour trouver le payin.
          const txRefCandidates = [tx.txRef, tx.transactionRef].filter(Boolean) as string[];
          let payin: any = null;
          for (const ref of txRefCandidates) {
            payin = await this.payinService.getPayinByTxRef(ref);
            if (payin) break;
          }
          if (!payin) {
            log(`[Reconcile] Payin tx=${tx.txRef} transactionRef=${tx.transactionRef} skip: aucun payin trouvé`);
            continue;
          }

          // Pour interroger FW, utiliser flwTxId (disponible directement ou via payin)
          // ou à défaut le tx_ref que FW connaît (transactionRef ou payin.txRef)
          const effectiveFlwTxId = tx.flwTxId || payin.flwTxId;

          // Backfill flwTxId on transaction if found from payin
          if (payin.flwTxId && !tx.flwTxId) {
            await this.updateTransactionFlwTxId(String(tx._id), String(payin.flwTxId));
          }
          const fwTxRef = tx.transactionRef || payin.txRef;
          log(`[Reconcile] Payin tx=${tx.txRef} flwTxId=${effectiveFlwTxId} fwTxRef=${fwTxRef} local=${tx.status} → vérification FW...`);

          let fwStatus: string | null = null;

          // Use numeric ID endpoint when available (most reliable)
          if (effectiveFlwTxId) {
            const resp: any = await firstValueFrom(
              this.httpService.get(`${fwBaseUrl}/transactions/${effectiveFlwTxId}/verify`, {
                headers: authHeader,
              }),
            );
            fwStatus = resp?.data?.data?.status;
          }

          // Fallback: verify by reference
          if (!fwStatus) {
            const resp: any = await firstValueFrom(
              this.httpService.get(`${fwBaseUrl}/transactions/verify_by_reference`, {
                headers: authHeader,
                params: { tx_ref: fwTxRef },
              }),
            );
            fwStatus = resp?.data?.data?.status;
          }

          if (!fwStatus) {
            log(`[Reconcile]   → pas de status FW retourné`);
            continue;
          }

          const isLocalSuccess = tx.status === TStatus.PAYINSUCCESS;
          const isLocalFailed = tx.status === TStatus.PAYINERROR || tx.status === TStatus.PAYINCLOSED;

          checkedCount++;
          log(`[Reconcile]   fw=${fwStatus}`);

          if (isLocalFailed && fwStatus === 'successful') {
            const amount = Number(tx.estimation) || 0;
            adjustments.push({
              transactionId: tx._id,
              txRef: tx.txRef,
              type: 'payin',
              localStatus: tx.status,
              fwStatus,
              action: 'credit',
              amount,
              reason: 'Payin local échec mais FW succès → crédit',
            });
            discrepancyCount++;
            netAdjustment += amount;
            await this.updateTransactionStatus(String(tx._id), TStatus.PAYINSUCCESS);
            log(`[Reconcile]   → CREDIT ${amount} (update status → PAYINSUCCESS)`);
          } else if (isLocalSuccess && (fwStatus === 'failed' || fwStatus === 'pending')) {
            const amount = Number(tx.estimation) || 0;
            adjustments.push({
              transactionId: tx._id,
              txRef: tx.txRef,
              type: 'payin',
              localStatus: tx.status,
              fwStatus,
              action: 'debit',
              amount,
              reason: 'Payin local succès mais FW échec → débit',
            });
            discrepancyCount++;
            netAdjustment -= amount;
            await this.updateTransactionStatus(String(tx._id), TStatus.PAYINERROR);
            log(`[Reconcile]   → DEBIT ${amount} (update status → PAYINERROR)`);
          } else {
            log(`[Reconcile]   → OK, pas d'action`);
          }
        }

        if (
          (tx.transactionType === 'transfer') ||
          (tx.transactionType === 'withdrawal') ||
          (tx.transactionType === 'apiCall' && tx.isApiPayout)
        ) {
          const payout = await this.payoutModel.findOne({ txRef: tx.txRef }).lean().exec();
          if (!payout) {
            log(`[Reconcile] Payout tx=${tx.txRef} skip: aucun payout trouvé`);
            continue;
          }

          log(`[Reconcile] Payout tx=${tx.txRef} ref=${payout.reference} local=${tx.status} → vérification FW...`);

          let fwStatus: string | null = null;

          const payoutFlwTxId = tx.flwTxId || (payout as any)?.flwTxId;

          // Use numeric transfer ID endpoint when available (most reliable)
          if (payoutFlwTxId) {
            try {
              const resp: any = await firstValueFrom(
                this.httpService.get(`${fwBaseUrl}/transfers/${payoutFlwTxId}`, {
                  headers: authHeader,
                }),
              );
              fwStatus = resp?.data?.data?.status;
            } catch {
              fwStatus = null;
            }
          }

          // Fallback: filter by reference
          if (!fwStatus) {
            const resp: any = await firstValueFrom(
              this.httpService.get(`${fwBaseUrl}/transfers`, {
                headers: authHeader,
                params: { reference: payout.reference },
              }),
            );
            const data = resp?.data?.data;
            fwStatus = Array.isArray(data) && data.length > 0 ? data[0].status : null;
          }

          if (!fwStatus) {
            log(`[Reconcile]   → pas de status FW retourné`);
            continue;
          }

          const isLocalSuccess = tx.status === TStatus.PAYOUTSUCCESS;
          const isLocalFailed =
            tx.status === TStatus.PAYOUTERROR ||
            tx.status === TStatus.PAYOUTCLOSED ||
            tx.status === TStatus.PAYOUTREJECTED;

          checkedCount++;
          log(`[Reconcile] Payout tx=${tx.txRef} local=${tx.status} fw=${fwStatus}`);

          if (isLocalSuccess && fwStatus === 'FAILED') {
            const amount = Number(tx.estimation) || 0;
            adjustments.push({
              transactionId: tx._id,
              txRef: tx.txRef,
              type: 'payout',
              localStatus: tx.status,
              fwStatus,
              action: 'credit',
              amount,
              reason: 'Payout local succès mais FW échec → crédit',
            });
            discrepancyCount++;
            netAdjustment += amount;
            await this.updateTransactionStatus(String(tx._id), TStatus.PAYOUTERROR);
            log(`[Reconcile]   → CREDIT ${amount} (update status → PAYOUTERROR)`);
          } else if (isLocalFailed && fwStatus === 'SUCCESSFUL') {
            const amount = Number(tx.estimation) || 0;
            adjustments.push({
              transactionId: tx._id,
              txRef: tx.txRef,
              type: 'payout',
              localStatus: tx.status,
              fwStatus,
              action: 'debit',
              amount,
              reason: 'Payout local échec mais FW succès → débit',
            });
            discrepancyCount++;
            netAdjustment -= amount;
            await this.updateTransactionStatus(String(tx._id), TStatus.PAYOUTSUCCESS);
            log(`[Reconcile]   → DEBIT ${amount} (update status → PAYOUTSUCCESS)`);
          } else {
            log(`[Reconcile]   → OK, pas d'action`);
          }
        }
      } catch (e) {
        log(`[Reconcile]   → ERREUR (tx=${tx.txRef}, type=${tx.transactionType}): ${e?.message || e}`);
        adjustments.push({
          transactionId: tx._id,
          txRef: tx.txRef,
          type: tx.transactionType,
          error: e?.message || 'Erreur vérification Flutterwave',
        });
      }
    }

    if (netAdjustment !== 0) {
      const userBalance = await this.balanceService.getBalanceByUserId(userId);
      const newBalance = userBalance.balance + netAdjustment;

      log(`[Reconcile] Ajustement solde: ${userBalance.balance} → ${newBalance} (${netAdjustment > 0 ? 'credit' : 'debit'} ${Math.abs(netAdjustment)})`);

      if (netAdjustment > 0) {
        await this.balanceService.creditBalance(
          userId,
          netAdjustment,
          userBalance.currency || 'XAF',
          `reconcile-credit:${userId}:${Date.now()}`,
        );
      } else {
        await this.balanceService.debitBalance(
          userId,
          Math.abs(netAdjustment),
          userBalance.currency || 'XAF',
          `reconcile-debit:${userId}:${Date.now()}`,
        );
      }
    } else {
      log(`[Reconcile] Aucun ajustement nécessaire`);
    }

    const userBalance = await this.balanceService.getBalanceByUserId(userId);

    return {
      userId,
      netAdjustment,
      previousBalance: userBalance.balance - netAdjustment,
      newBalance: userBalance.balance,
      checkedCount,
      discrepancyCount,
      adjustments,
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
      userId: userId,
      ...this.withdrawalPayoutMatch(),
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
