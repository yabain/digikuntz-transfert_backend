import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { TransactionType } from 'src/transaction/transaction.schema';
import { UserService } from 'src/user/user.service';
import { BalanceService } from 'src/balance/balance.service';
import { CreatePaymentRequestDto } from './create-payment-request.dto';
import {
  PaymentRequest,
  PaymentRequestDocument,
  PaymentRequestStatus,
} from './payment-request.schema';
import { Transaction } from 'src/transaction/transaction.schema';

@Injectable()
export class PaymentRequestService {
  constructor(
    @InjectModel(PaymentRequest.name)
    private readonly paymentRequestModel: mongoose.Model<PaymentRequestDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: mongoose.Model<any>,
    private readonly userService: UserService,
    private readonly balanceService: BalanceService,
    @Inject(forwardRef(() => FlutterwaveService))
    private readonly flutterwaveService: FlutterwaveService,
  ) { }

  private getPagination(query: any) {
    const page = Number(query?.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = Number(query?.limit || query?.resPerPage);
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 10;
    const skip = (page - 1) * limit;
    return { page, limit, skip };
  }

  private normalizePhoneForDisplay(value: string): string {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  private normalizeKesMsisdnStrict(value: string): string {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
      throw new BadRequestException('Invalid KES mobile number: empty phone');
    }

    if (digits.startsWith('254') && digits.length === 12) return digits;
    if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
    if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
      return `254${digits}`;
    }

    throw new BadRequestException(
      'Invalid KES mobile number format. Expected 254XXXXXXXXX',
    );
  }

  async createCurrentUserPaymentRequest(userId: string, data: CreatePaymentRequestDto) {
    const currentUser: any = await this.userService.getUserById(userId);
    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    const currency = String(currentUser?.countryId?.currency || '').toUpperCase();
    if (!currency) {
      throw new BadRequestException('Current user currency is not configured');
    }
    if (!['XAF', 'NGN', 'KES'].includes(currency)) {
      throw new BadRequestException(
        `Unsupported currency "${currency}" for payment request`,
      );
    }

    const senderPhone =
      currency === 'KES'
        ? this.normalizeKesMsisdnStrict(data.mobile_money?.phone)
        : this.normalizePhoneForDisplay(data.mobile_money?.phone);
    const senderName =
      data.email?.split('@')?.[0] || 'Payment Request Customer';
    const transactionData = {
      estimation: Number(data.amount),
      transactionRef: this.generateId(),
      raisonForTransfer: data.reason || 'Payment request',
      senderEmail: data.email,
      senderName,
      senderContact: senderPhone,
      senderCountry: currentUser?.countryId?.name || '',
      senderCurrency: currency,
      senderId: currentUser._id,
      receiverId: currentUser._id,
      receiverName:
        currentUser?.name ||
        `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim(),
      receiverEmail: currentUser?.email,
      receiverContact: currentUser?.phone || currentUser?.whatsapp || '',
      receiverCurrency: currency,
      receiverCountry: currentUser?.countryId?.name || '',
      receiverCountryCode: String(currentUser?.countryId?.code || ''),
      receiverAddress: currentUser?.address || '',
      paymentMethod: (data.mobile_money?.provider || '').toUpperCase(),
      receiverMobileAccountNumber: senderPhone,
      bankAccountNumber: senderPhone,
      bankCode: (data.mobile_money?.provider || '').toUpperCase(),
      transactionType: TransactionType.PAYMENTREQUEST,
      status: 'transaction_payin_pending',
      userId,
    };

    const initResp: any = await this.flutterwaveService.createPayin(
      transactionData,
      userId,
    );

    const transactionId = String(initResp?.transactionId || '');
    if (mongoose.Types.ObjectId.isValid(transactionId)) {
      await this.paymentRequestModel
        .findOneAndUpdate(
          { transactionId },
          {
            transactionId,
            userId,
            status: PaymentRequestStatus.PENDING,
            amount: Number(data.amount),
            currency,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .exec();
    }

    return initResp;
  }

  generateId(): string {
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

  async handlePaymentRequest(transaction: any): Promise<any> {
    if (!transaction?._id) {
      throw new BadRequestException('Invalid transaction for payment request');
    }

    try {
      const amount = Number(transaction.estimation);
      const currency = String(
        transaction.senderCurrency || transaction.receiverCurrency || '',
      ).toUpperCase();

      const doc = await this.paymentRequestModel
        .findOneAndUpdate(
          { transactionId: transaction._id },
          {
            userId: transaction.receiverId || transaction.userId,
            status: PaymentRequestStatus.SUCCESS,
            amount: Number.isFinite(amount) ? amount : 0,
            currency,
          },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        )
        .lean()
        .exec();

      return doc;
    } catch (error) {
      await this.updatePaymentRequestStatusByTransaction(
        String(transaction._id),
        PaymentRequestStatus.FAILED,
      );
      throw error;
    }
  }

  async updatePaymentRequestStatusByTransaction(
    transactionId: string,
    status: PaymentRequestStatus,
  ) {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return null;
    }
    return this.paymentRequestModel
      .findOneAndUpdate(
        { transactionId },
        { status },
        { new: true },
      )
      .lean()
      .exec();
  }

  async getMyPaymentRequestStats(userId: string): Promise<{
    total: number;
    pending: number;
    success: number;
    canceled: number;
    failed: number;
  }> {
    const [total, pending, success, canceled, failed] = await Promise.all([
      this.paymentRequestModel.countDocuments({ userId }),
      this.paymentRequestModel.countDocuments({ userId, status: PaymentRequestStatus.PENDING }),
      this.paymentRequestModel.countDocuments({ userId, status: PaymentRequestStatus.SUCCESS }),
      this.paymentRequestModel.countDocuments({ userId, status: PaymentRequestStatus.CANCELED }),
      this.paymentRequestModel.countDocuments({ userId, status: PaymentRequestStatus.FAILED }),
    ]);
    return { total, pending, success, canceled, failed };
  }

  async getAllPaymentRequestStats(): Promise<{
    total: number;
    pending: number;
    success: number;
    canceled: number;
    failed: number;
  }> {
    const [total, pending, success, canceled, failed] = await Promise.all([
      this.paymentRequestModel.countDocuments(),
      this.paymentRequestModel.countDocuments({ status: PaymentRequestStatus.PENDING }),
      this.paymentRequestModel.countDocuments({ status: PaymentRequestStatus.SUCCESS }),
      this.paymentRequestModel.countDocuments({ status: PaymentRequestStatus.CANCELED }),
      this.paymentRequestModel.countDocuments({ status: PaymentRequestStatus.FAILED }),
    ]);
    return { total, pending, success, canceled, failed };
  }

  private buildFilter(query: any, userId?: string) {
    const filter: any = {};
    if (userId) filter.userId = userId;

    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (query.status && query.status !== 'all') {
      if (query.status === 'failed') {
        filter.$or = [
          { status: PaymentRequestStatus.FAILED },
          { status: PaymentRequestStatus.CANCELED },
        ];
      } else {
        filter.status = query.status;
      }
    }

    if (query.keyword) {
      const keyword = String(query.keyword).trim();
      const conditions: any[] = [];
      if (mongoose.Types.ObjectId.isValid(keyword)) {
        conditions.push({ _id: new mongoose.Types.ObjectId(keyword) });
      }
      const num = Number(keyword);
      if (!isNaN(num)) {
        conditions.push({ amount: num });
      }
      conditions.push({ currency: { $regex: keyword, $options: 'i' } });
      conditions.push({ status: { $regex: keyword, $options: 'i' } });
      if (conditions.length > 0) {
        filter.$or = conditions;
      }
    }

    return filter;
  }

  async getMyPaymentRequests(userId: string, query: any) {
    const { page, limit, skip } = this.getPagination(query);
    const filter = this.buildFilter(query, userId);
    const [data, totalItems] = await Promise.all([
      this.paymentRequestModel
        .find(filter)
        .populate('transactionId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.paymentRequestModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        currentPage: page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        hasNextPage: page * limit < totalItems,
      },
    };
  }

  private statusMap: Record<string, PaymentRequestStatus> = {
    transaction_payin_success: PaymentRequestStatus.SUCCESS,
    transaction_success: PaymentRequestStatus.SUCCESS,
    transaction_payout_success: PaymentRequestStatus.SUCCESS,
    transaction_payin_error: PaymentRequestStatus.FAILED,
    transaction_payout_error: PaymentRequestStatus.FAILED,
    transaction_payout_rejected: PaymentRequestStatus.FAILED,
    transaction_error: PaymentRequestStatus.FAILED,
    transaction_payin_closed: PaymentRequestStatus.CANCELED,
    transaction_payout_closed: PaymentRequestStatus.CANCELED,
  };

  async syncPendingPaymentRequests(): Promise<number> {
    const pendings = await this.paymentRequestModel
      .find({ status: PaymentRequestStatus.PENDING })
      .select('transactionId')
      .lean()
      .exec();

    if (pendings.length === 0) return 0;

    const txIds = pendings
      .map((p: any) => p.transactionId)
      .filter((id: any) => mongoose.Types.ObjectId.isValid(id));

    const transactions = await this.transactionModel
      .find({ _id: { $in: txIds } })
      .select('_id status')
      .lean()
      .exec();

    const txStatusMap = new Map<string, string>();
    for (const tx of transactions) {
      txStatusMap.set(String(tx._id), tx.status);
    }

    let updated = 0;
    for (const pr of pendings) {
      const txStatus = txStatusMap.get(String(pr.transactionId));
      if (!txStatus) continue;
      const mapped = this.statusMap[txStatus];
      if (!mapped) continue;

      await this.paymentRequestModel
        .findOneAndUpdate({ _id: pr._id }, { status: mapped })
        .exec();
      updated++;
    }

    return updated;
  }

  async getAllSystemPaymentRequests(query: any) {
    const { page, limit, skip } = this.getPagination(query);
    const filter = this.buildFilter(query);
    const [data, totalItems] = await Promise.all([
      this.paymentRequestModel
        .find(filter)
        .populate('transactionId')
        .populate('userId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.paymentRequestModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        currentPage: page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        hasNextPage: page * limit < totalItems,
      },
    };
  }
}
