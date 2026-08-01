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
  Logger,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import { CreateBalanceDto } from './create-balance.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Balance } from './balance.schema';
import { BalanceMovement } from './balance-movement.schema';
import { UserService } from 'src/user/user.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    @InjectModel(Balance.name)
    private balanceModel: mongoose.Model<Balance>,
    @InjectModel(BalanceMovement.name)
    private balanceMovementModel: mongoose.Model<BalanceMovement>,
    private userService: UserService,
    private auditLogService: AuditLogService,
  ) {}

  async creatBalance(data: CreateBalanceDto): Promise<any> {
    try {
      return await this.balanceModel.create({ ...data, balance: data.balance ?? 0 });
    } catch (error: any) {
      if (error?.code === 11000) {
        return this.balanceModel.findOne({ userId: data.userId });
      }
      throw error;
    }
  }

  async getBalanceByUserId(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    try {
      return await this.balanceModel
        .findOneAndUpdate(
          { userId },
          { $setOnInsert: { userId, balance: 0 } },
          { upsert: true, new: true },
        )
        .exec();
    } catch (error: any) {
      // Concurrent first-create race on unique userId
      if (error?.code === 11000) {
        return this.balanceModel.findOne({ userId }).exec();
      }
      throw error;
    }
  }

  /**
   * Credit wallet. When `idempotencyKey` is set, a second call with the same key
   * is a no-op (at-most-once across instances).
   */
  async creditBalance(
    userId: string,
    amount: number,
    senderCurrency: string,
    idempotencyKey?: string,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid credit amount');
    }

    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.countryId.currency !== senderCurrency) {
      throw new BadRequestException('Currency mismatch');
    }

    await this.getBalanceByUserId(userId);

    const resp = await this.balanceModel.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount } },
      { new: true, runValidators: true },
    );

    if (!resp) {
      throw new NotFoundException('User not found');
    }

    if (idempotencyKey) {
      try {
        await this.balanceMovementModel.create({
          key: idempotencyKey,
          userId,
          type: 'credit',
          amount,
          currency: senderCurrency,
        });
      } catch (error: any) {
        if (error?.code === 11000) {
          // Another instance already recorded this movement → reverse our $inc
          this.logger.warn(
            `Idempotent credit skipped (key=${idempotencyKey}), reversing duplicate $inc`,
          );
          return this.balanceModel.findOneAndUpdate(
            { userId },
            { $inc: { balance: -amount } },
            { new: true },
          );
        }
        // Persist failed after credit — reverse to keep ledger consistent
        await this.balanceModel
          .findOneAndUpdate({ userId }, { $inc: { balance: -amount } })
          .exec()
          .catch(() => undefined);
        throw error;
      }
    }

    void this.auditLogService.record({
      action: 'balance.credit',
      resourceType: 'balance',
      resourceId: String(resp._id),
      metadata: { userId, amount, currency: senderCurrency, idempotencyKey },
    });

    return resp;
  }

  /**
   * Indique si une écriture de solde existe déjà pour une clé d'idempotence.
   * Permet d'éviter de rejouer inutilement un crédit déjà effectué.
   */
  async hasMovementKey(key: string): Promise<boolean> {
    return !!(await this.balanceMovementModel.exists({ key }).exec());
  }

  /**
   * Debit wallet atomically (`balance >= amount`). Optional idempotency key.
   */
  async debitBalance(
    userId: string,
    amount: number,
    currency: string,
    idempotencyKey?: string,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid debit amount');
    }

    const user = await this.userService.getUserWithCurrency(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.countryId?.currency !== currency) {
      throw new BadRequestException('Currency mismatch');
    }

    await this.getBalanceByUserId(userId);

    const resp = await this.balanceModel.findOneAndUpdate(
      { userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, runValidators: true },
    );

    if (!resp) {
      throw new BadRequestException('Insufficient balance or user not found');
    }

    if (idempotencyKey) {
      try {
        await this.balanceMovementModel.create({
          key: idempotencyKey,
          userId,
          type: 'debit',
          amount,
          currency,
        });
      } catch (error: any) {
        if (error?.code === 11000) {
          this.logger.warn(
            `Idempotent debit skipped (key=${idempotencyKey}), reversing duplicate $inc`,
          );
          return this.balanceModel.findOneAndUpdate(
            { userId },
            { $inc: { balance: amount } },
            { new: true },
          );
        }
        await this.balanceModel
          .findOneAndUpdate({ userId }, { $inc: { balance: amount } })
          .exec()
          .catch(() => undefined);
        throw error;
      }
    }

    void this.auditLogService.record({
      action: 'balance.debit',
      resourceType: 'balance',
      resourceId: String(resp._id),
      metadata: { userId, amount, currency, idempotencyKey },
    });

    return resp;
  }
}
