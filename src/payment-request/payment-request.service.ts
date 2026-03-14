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

@Injectable()
export class PaymentRequestService {
  constructor(
    @InjectModel(PaymentRequest.name)
    private readonly paymentRequestModel: mongoose.Model<PaymentRequestDocument>,
    private readonly userService: UserService,
    private readonly balanceService: BalanceService,
    @Inject(forwardRef(() => FlutterwaveService))
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

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
      {
      paymentRequestMode: true,
      paymentRequestInput: data,
      },
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

    try {
      await this.balanceService.creditBalance(
        String(transaction.receiverId || transaction.userId),
        Number.isFinite(amount) ? amount : 0,
        currency,
      );
    } catch (error) {
      await this.updatePaymentRequestStatusByTransaction(
        String(transaction._id),
        PaymentRequestStatus.FAILED,
      );
      throw error;
    }

    return doc;
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

  async getMyPaymentRequests(userId: string, query: any) {
    const { page, limit, skip } = this.getPagination(query);
    const [data, totalItems] = await Promise.all([
      this.paymentRequestModel
        .find({ userId })
        .populate('transactionId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.paymentRequestModel.countDocuments({ userId }),
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

  async getAllSystemPaymentRequests(query: any) {
    const { page, limit, skip } = this.getPagination(query);
    const [data, totalItems] = await Promise.all([
      this.paymentRequestModel
        .find()
        .populate('transactionId')
        .populate('userId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.paymentRequestModel.countDocuments(),
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
