/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import { CreateBalanceDto } from './create-balance.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Balance } from './balance.schema';
import { UserService } from 'src/user/user.service';

@Injectable()
export class BalanceService {
  constructor(
    @InjectModel(Balance.name)
    private balanceModel: mongoose.Model<Balance>,
    private userService: UserService,
  ) {}

  async creatBalance(data: CreateBalanceDto): Promise<any> {
    const balance = await this.balanceModel.create({ ...data });
    return balance;
  }

  async getBalanceByUserId(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    let balance = await this.balanceModel.findOne({ userId });
    if (!balance) {
      balance = await this.creatBalance({ userId, balance: 0 });
    }
    return balance;
  }

  async creditBalance(
    userId: string,
    amount: number,
    senderCurrency: string,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user');
    }
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.countryId.currency !== senderCurrency) {
      throw new BadRequestException('Currency mismatch');
    }

    const userBalance = await this.getBalanceByUserId(userId);

    // Update user balance in the database
    const resp = await this.balanceModel.findOneAndUpdate(
      { userId: userId },
      { $inc: { balance: amount } }, // increment balance
      { new: true, runValidators: true }, // return updated balance
    );

    if (!resp) {
      throw new NotFoundException('User not found');
    }

    return resp;
  }

  async debitBalance(
    userId: string,
    amount: number,
    currency: string,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user');
    }

    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.countryId.currency !== currency) {
      throw new BadRequestException('Currency mismatch');
    }

    // Atomic conditional debit: only decrement if current balance >= amount
    const resp = await this.balanceModel.findOneAndUpdate(
      { userId: userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!resp) {
      // Either user not found or insufficient funds
      throw new BadRequestException('Insufficient balance or user not found');
    }

    return resp;
  }
}
