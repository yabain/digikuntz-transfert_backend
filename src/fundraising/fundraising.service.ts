import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { UserService } from 'src/user/user.service';
import { BalanceService } from 'src/balance/balance.service';
import { OperationNotificationService } from 'src/notification/operation-notification.service';
import { CreateDonationDto } from './create-donation.dto';
import { CreateFundraisingDto } from './create-fundraising.dto';
import {
  Fundraising,
  FundraisingDocument,
  FundraisingVisibility,
} from './fundraising.schema';
import { Donation, DonationDocument } from './donation.schema';
import { UpdateFundraisingDto } from './update-fundraising.dto';

@Injectable()
export class FundraisingService {
  constructor(
    @InjectModel(Fundraising.name)
    private fundraisingModel: mongoose.Model<FundraisingDocument>,
    @InjectModel(Donation.name)
    private donationModel: mongoose.Model<DonationDocument>,
    private userService: UserService,
    private balanceService: BalanceService,
    private operationNotificationService: OperationNotificationService,
  ) {}

  private getPagination(query: any) {
    const page = Number(query?.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = Number(query?.limit || query?.resPerPage);
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 10;
    const skip = (page - 1) * limit;
    return { page, limit, skip };
  }

  private async ensureOwnerOrAdmin(userId: string, fundraisingId: string) {
    const fundraising = await this.findById(fundraisingId);
    const requester = await this.userService.getUserById(userId);
    if (!requester) {
      throw new UnauthorizedException('Unauthorized');
    }
    const isOwner = String(fundraising.creatorId) === String(userId);
    if (!isOwner && requester.isAdmin !== true) {
      throw new UnauthorizedException('Unauthorized');
    }
    return fundraising;
  }

  async findById(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid fundraising ID');
    }
    const fundraising = await this.fundraisingModel.findById(id).lean().exec();
    if (!fundraising) {
      throw new NotFoundException('Fundraising not found');
    }
    return fundraising;
  }

  async createFundraising(userId: string, data: CreateFundraisingDto) {
    const creator = await this.userService.getUserById(userId);
    if (!creator) {
      throw new NotFoundException('User not found');
    }

    const currency = data.currency || creator?.countryId?.currency;
    if (!currency) {
      throw new BadRequestException('Currency is required');
    }

    if (data.currency && data.currency !== creator?.countryId?.currency) {
      throw new BadRequestException('Currency must match creator country currency');
    }

    const endDate = new Date(data.endDate);
    if (Number.isNaN(endDate.getTime()) || endDate <= new Date()) {
      throw new BadRequestException('End date must be in the future');
    }

    const created = await this.fundraisingModel.create({
      title: data.title,
      subTitle: data.subTitle || '',
      description: data.description || '',
      targetAmount: data.targetAmount,
      collectedAmount: 0,
      currency,
      creatorId: userId,
      endDate,
      visibility: data.visibility || FundraisingVisibility.PUBLIC,
      status: typeof data.status === 'boolean' ? data.status : true,
      coverImageUrl: data.coverImageUrl || '',
    } as any);

    return created;
  }

  async getAllSystem(query: any) {
    const { page, limit, skip } = this.getPagination(query);

    const [data, totalItems] = await Promise.all([
      this.fundraisingModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.fundraisingModel.countDocuments(),
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

  async getUserFundraisings(userId: string, query: any) {
    const { page, limit, skip } = this.getPagination(query);
    const [data, totalItems] = await Promise.all([
      this.fundraisingModel
        .find({ creatorId: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.fundraisingModel.countDocuments({ creatorId: userId }),
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

  async getUserActiveFundraisings(userId: string, query: any) {
    const { page, limit, skip } = this.getPagination(query);
    const filter = {
      creatorId: userId,
      status: true,
      endDate: { $gt: new Date() },
    };
    const [data, totalItems] = await Promise.all([
      this.fundraisingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.fundraisingModel.countDocuments(filter),
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

  async getUserActivePublicFundraisings(userId: string, query: any) {
    const { page, limit, skip } = this.getPagination(query);
    const filter = {
      creatorId: userId,
      status: true,
      visibility: FundraisingVisibility.PUBLIC,
      endDate: { $gt: new Date() },
    };
    const [data, totalItems] = await Promise.all([
      this.fundraisingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.fundraisingModel.countDocuments(filter),
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

  async updateStatus(userId: string, fundraisingId: string, status: boolean) {
    await this.ensureOwnerOrAdmin(userId, fundraisingId);
    return this.fundraisingModel
      .findByIdAndUpdate(
        fundraisingId,
        { status },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  async updateVisibility(
    userId: string,
    fundraisingId: string,
    visibility: FundraisingVisibility,
  ) {
    await this.ensureOwnerOrAdmin(userId, fundraisingId);
    return this.fundraisingModel
      .findByIdAndUpdate(
        fundraisingId,
        { visibility },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  async updateFundraising(
    userId: string,
    fundraisingId: string,
    data: UpdateFundraisingDto,
  ) {
    const fundraising = await this.ensureOwnerOrAdmin(userId, fundraisingId);

    if (typeof data.targetAmount === 'number' && data.targetAmount < fundraising.collectedAmount) {
      throw new BadRequestException('Target amount cannot be lower than collected amount');
    }

    if (data.endDate) {
      const endDate = new Date(data.endDate);
      if (Number.isNaN(endDate.getTime()) || endDate <= new Date()) {
        throw new BadRequestException('End date must be in the future');
      }
    }

    return this.fundraisingModel
      .findByIdAndUpdate(
        fundraisingId,
        {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.subTitle !== undefined ? { subTitle: data.subTitle } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.targetAmount !== undefined ? { targetAmount: data.targetAmount } : {}),
          ...(data.endDate !== undefined ? { endDate: new Date(data.endDate) } : {}),
          ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
          ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl } : {}),
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  async buildDonationTransactionData(
    fundraisingId: string,
    donorId: string,
    data: CreateDonationDto,
  ) {
    const fundraising = await this.findById(fundraisingId);
    if (fundraising.status !== true) {
      throw new BadRequestException('This fundraising is not active');
    }
    if (fundraising.visibility !== FundraisingVisibility.PUBLIC) {
      throw new BadRequestException('This fundraising is private');
    }
    if (new Date(fundraising.endDate) <= new Date()) {
      throw new BadRequestException('This fundraising is closed');
    }

    const [donor, creator] = await Promise.all([
      this.userService.getUserById(donorId),
      this.userService.getUserById(String(fundraising.creatorId)),
    ]);

    if (!donor) {
      throw new NotFoundException('Donor not found');
    }
    if (!creator) {
      throw new NotFoundException('Fundraising creator not found');
    }

    const countryCodeSender = donor?.countryId?.code?.toString?.() || '';
    const countryCodeReceiver = creator?.countryId?.code?.toString?.() || '';

    return {
      transactionRef: `DON-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      estimation: Number(data.amount),
      transactionType: 'fundraising',
      fundraisingId: String(fundraising._id),
      donorVisibility: typeof data.visibility === 'boolean' ? data.visibility : true,
      donationMessage: data.message || '',
      raisonForTransfer:
        data.message || `Donation for fundraising: ${fundraising.title}`,

      senderId: donor._id.toString(),
      senderName: donor?.name || `${donor.firstName} ${donor.lastName}`,
      senderEmail: donor.email,
      senderContact: donor.phone,
      senderCountry: donor?.countryId?.name || '',
      senderCountryCode: countryCodeSender,
      senderCurrency: fundraising.currency,

      receiverId: creator._id.toString(),
      receiverName: creator?.name || `${creator.firstName} ${creator.lastName}`,
      receiverEmail: creator.email,
      receiverContact: creator.phone,
      receiverCountry: creator?.countryId?.name || '',
      receiverCountryCode: countryCodeReceiver,
      receiverCurrency: fundraising.currency,

      status: 'transaction_payin_pending',
    };
  }

  async handleSuccessfulDonation(transaction: any) {
    if (!transaction?.fundraisingId) {
      throw new BadRequestException('Missing fundraisingId in transaction');
    }

    const existingDonation = await this.donationModel
      .findOne({ transactionId: transaction._id })
      .lean()
      .exec();

    if (existingDonation) {
      return {
        donation: existingDonation,
        duplicated: true,
      };
    }

    const fundraising = await this.findById(String(transaction.fundraisingId));
    const amount = Number(transaction.estimation);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid donation amount');
    }

    const donation = await this.donationModel.create({
      fundraisingId: String(fundraising._id),
      fundraisingCreatorId: String(fundraising.creatorId),
      donorId: String(transaction.senderId || transaction.userId),
      transactionId: String(transaction._id),
      amount,
      currency: fundraising.currency,
      visibility:
        typeof transaction.donorVisibility === 'boolean'
          ? transaction.donorVisibility
          : true,
      message: transaction.donationMessage || '',
      status: 'successful',
    });

    await Promise.all([
      this.balanceService.creditBalance(
        String(fundraising.creatorId),
        amount,
        fundraising.currency,
      ),
      this.fundraisingModel
        .findByIdAndUpdate(fundraising._id, {
          $inc: { collectedAmount: amount },
        })
        .exec(),
    ]);

    void this.operationNotificationService
      .notifyFundraisingDonation(transaction, fundraising, donation)
      .catch((error) =>
        console.error('notifyFundraisingDonation failed:', error),
      );

    return { donation, duplicated: false };
  }

  async getTotalDonationsCount() {
    const totalDonations = await this.donationModel.countDocuments();
    return { totalDonations };
  }

  async getFundraisingDonationStats(fundraisingId: string) {
    if (!mongoose.Types.ObjectId.isValid(fundraisingId)) {
      throw new NotFoundException('Invalid fundraising ID');
    }

    const fundraising = await this.findById(fundraisingId);
    const stats = await this.donationModel.aggregate([
      {
        $match: {
          fundraisingId: new mongoose.Types.ObjectId(fundraisingId),
        },
      },
      {
        $group: {
          _id: null,
          totalDonations: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    return {
      fundraisingId,
      fundraisingTitle: fundraising.title,
      currency: fundraising.currency,
      totalDonations: stats?.[0]?.totalDonations || 0,
      totalAmount: stats?.[0]?.totalAmount || 0,
    };
  }

  async getUserDonationStats(userId: string) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const [asDonor, asBeneficiary, totalInvolved] = await Promise.all([
      this.donationModel.aggregate([
        { $match: { donorId: userObjectId } },
        {
          $group: {
            _id: null,
            totalDonations: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]),
      this.donationModel.aggregate([
        { $match: { fundraisingCreatorId: userObjectId } },
        {
          $group: {
            _id: null,
            totalDonations: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]),
      this.donationModel.aggregate([
        {
          $match: {
            $or: [{ donorId: userObjectId }, { fundraisingCreatorId: userObjectId }],
          },
        },
        {
          $group: {
            _id: null,
            totalDonations: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    return {
      userId,
      donated: {
        totalDonations: asDonor?.[0]?.totalDonations || 0,
        totalAmount: asDonor?.[0]?.totalAmount || 0,
      },
      received: {
        totalDonations: asBeneficiary?.[0]?.totalDonations || 0,
        totalAmount: asBeneficiary?.[0]?.totalAmount || 0,
      },
      totalInvolved: {
        totalDonations: totalInvolved?.[0]?.totalDonations || 0,
        totalAmount: totalInvolved?.[0]?.totalAmount || 0,
      },
    };
  }

  async getDonationDetails(donationId: string) {
    if (!mongoose.Types.ObjectId.isValid(donationId)) {
      throw new NotFoundException('Invalid donation ID');
    }

    const donation = await this.donationModel
      .findById(donationId)
      .populate({
        path: 'fundraisingId',
      })
      .populate({
        path: 'donorId',
        select:
          '_id firstName lastName name email phone whatsapp language countryId pictureUrl',
      })
      .populate({
        path: 'fundraisingCreatorId',
        select:
          '_id firstName lastName name email phone whatsapp language countryId pictureUrl',
      })
      .populate({
        path: 'transactionId',
      })
      .lean()
      .exec();

    if (!donation) {
      throw new NotFoundException('Donation not found');
    }
    return donation;
  }

  async getFundraisingDonationsPaginated(fundraisingId: string, query: any) {
    if (!mongoose.Types.ObjectId.isValid(fundraisingId)) {
      throw new NotFoundException('Invalid fundraising ID');
    }

    await this.findById(fundraisingId);

    const page = Number(query?.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = Number(query?.limit || query?.resPerPage);
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 10;
    const skip = (page - 1) * limit;

    const filter = {
      fundraisingId: new mongoose.Types.ObjectId(fundraisingId),
    };

    const [data, totalItems] = await Promise.all([
      this.donationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'fundraisingId',
        })
        .populate({
          path: 'donorId',
          select:
            '_id firstName lastName name email phone whatsapp language countryId pictureUrl',
        })
        .populate({
          path: 'fundraisingCreatorId',
          select:
            '_id firstName lastName name email phone whatsapp language countryId pictureUrl',
        })
        .populate({
          path: 'transactionId',
        })
        .lean()
        .exec(),
      this.donationModel.countDocuments(filter),
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
