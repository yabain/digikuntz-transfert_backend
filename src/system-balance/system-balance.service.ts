/* eslint-disable prettier/prettier */
 
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { SystemBalance } from './system-balance.schema';
import { SystemBalanceMovement } from './system-balance-movement.schema';

@Injectable()
export class SystemBalanceService {
  private readonly logger = new Logger(SystemBalanceService.name);

  constructor(
    @InjectModel(SystemBalance.name)
    private systemBalanceModel: mongoose.Model<SystemBalance>,
    @InjectModel(SystemBalanceMovement.name)
    private systemBalanceMovementModel: mongoose.Model<SystemBalanceMovement>,
  ) {}

  private normalizeCurrency(currency: string): string {
    const cur = String(currency || '')
      .trim()
      .toUpperCase();
    if (!cur) {
      throw new BadRequestException('Currency is required');
    }
    return cur;
  }

  async getSystemBalance(currency: string): Promise<SystemBalance> {
    const cur = this.normalizeCurrency(currency);
    try {
      return await this.systemBalanceModel
        .findOneAndUpdate(
          { currency: cur },
          { $setOnInsert: { currency: cur, balance: 0 } },
          { upsert: true, new: true },
        )
        .exec();
    } catch (error: any) {
      if (error?.code === 11000) {
        return this.systemBalanceModel.findOne({ currency: cur }).exec() as Promise<SystemBalance>;
      }
      throw error;
    }
  }

  async getAllSystemBalances(): Promise<SystemBalance[]> {
    return this.systemBalanceModel.find().sort({ currency: 1 }).exec();
  }

  /**
   * Credit system balance. When `idempotencyKey` is set, a second call with
   * the same key is a no-op (at-most-once across instances).
   */
  async creditSystemBalance(
    currency: string,
    amount: number,
    idempotencyKey?: string,
    meta?: { reference?: string; description?: string },
  ): Promise<SystemBalance> {
    const cur = this.normalizeCurrency(currency);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid credit amount');
    }

    await this.getSystemBalance(cur);

    const resp = await this.systemBalanceModel.findOneAndUpdate(
      { currency: cur },
      { $inc: { balance: amount } },
      { new: true, runValidators: true },
    );

    if (!resp) {
      throw new NotFoundException('System balance not found');
    }

    if (idempotencyKey) {
      try {
        await this.systemBalanceMovementModel.create({
          key: idempotencyKey,
          type: 'credit',
          amount,
          currency: cur,
          reference: meta?.reference ?? '',
          description: meta?.description ?? '',
        });
      } catch (error: any) {
        if (error?.code === 11000) {
          // Another instance already recorded this movement → reverse our $inc
          this.logger.warn(
            `Idempotent system credit skipped (key=${idempotencyKey}), reversing duplicate $inc`,
          );
          return this.systemBalanceModel.findOneAndUpdate(
            { currency: cur },
            { $inc: { balance: -amount } },
            { new: true },
          ).exec() as Promise<SystemBalance>;
        }
        // Persist failed after credit — reverse to keep ledger consistent
        await this.systemBalanceModel
          .findOneAndUpdate({ currency: cur }, { $inc: { balance: -amount } })
          .exec()
          .catch(() => undefined);
        throw error;
      }
    }

    return resp;
  }

  /**
   * Debit system balance atomically (`balance >= amount`).
   * Optional idempotency key.
   */
  async debitSystemBalance(
    currency: string,
    amount: number,
    idempotencyKey?: string,
    meta?: { reference?: string; description?: string },
  ): Promise<SystemBalance> {
    const cur = this.normalizeCurrency(currency);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid debit amount');
    }

    await this.getSystemBalance(cur);

    const resp = await this.systemBalanceModel.findOneAndUpdate(
      { currency: cur, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, runValidators: true },
    );

    if (!resp) {
      throw new BadRequestException(
        'Insufficient system balance or currency not found',
      );
    }

    if (idempotencyKey) {
      try {
        await this.systemBalanceMovementModel.create({
          key: idempotencyKey,
          type: 'debit',
          amount,
          currency: cur,
          reference: meta?.reference ?? '',
          description: meta?.description ?? '',
        });
      } catch (error: any) {
        if (error?.code === 11000) {
          this.logger.warn(
            `Idempotent system debit skipped (key=${idempotencyKey}), reversing duplicate $inc`,
          );
          return this.systemBalanceModel.findOneAndUpdate(
            { currency: cur },
            { $inc: { balance: amount } },
            { new: true },
          ).exec() as Promise<SystemBalance>;
        }
        await this.systemBalanceModel
          .findOneAndUpdate({ currency: cur }, { $inc: { balance: amount } })
          .exec()
          .catch(() => undefined);
        throw error;
      }
    }

    return resp;
  }

  /**
   * Indique si une écriture de solde système existe déjà pour une clé
   * d'idempotence. Permet d'éviter de rejouer un crédit déjà effectué.
   */
  async hasMovementKey(key: string): Promise<boolean> {
    return !!(await this.systemBalanceMovementModel.exists({ key }).exec());
  }

  /**
   * Liste paginée et filtrable des mouvements du solde système.
   */
  async getMovements(options: {
    currency?: string;
    page?: number;
    limit?: number;
    keyword?: string;
    type?: string;
  }): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(Number(options.page) || 1, 1);
    const limit = [10, 25, 50, 100].includes(Number(options.limit))
      ? Number(options.limit)
      : 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (options.currency) {
      filter.currency = this.normalizeCurrency(options.currency);
    }
    if (options.type === 'credit' || options.type === 'debit') {
      filter.type = options.type;
    }
    if (typeof options.keyword === 'string' && options.keyword.trim()) {
      const kw = options.keyword.trim();
      const regex = { $regex: kw, $options: 'i' };
      filter.$or = [
        { key: regex },
        { type: regex },
        { reference: regex },
        { description: regex },
      ];
    }

    const [data, total] = await Promise.all([
      this.systemBalanceMovementModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.systemBalanceMovementModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Statistiques d'une devise : solde, total des crédits (payin), total des
   * débits (payout) et leurs compteurs.
   */
  async getStats(currency: string): Promise<{
    currency: string;
    balance: number;
    totalPayin: number;
    totalPayout: number;
    countPayin: number;
    countPayout: number;
  }> {
    const cur = this.normalizeCurrency(currency);
    const balance = await this.getSystemBalance(cur);

    const pipeline: any[] = [
      { $match: { currency: cur } },
      {
        $group: {
          _id: null,
          totalPayin: {
            $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] },
          },
          totalPayout: {
            $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] },
          },
          countPayin: {
            $sum: { $cond: [{ $eq: ['$type', 'credit'] }, 1, 0] },
          },
          countPayout: {
            $sum: { $cond: [{ $eq: ['$type', 'debit'] }, 1, 0] },
          },
        },
      },
    ];

    const rows = await this.systemBalanceMovementModel
      .aggregate(pipeline)
      .exec();

    const stats = rows[0] || {};
    return {
      currency: cur,
      balance: Number(balance.balance ?? 0),
      totalPayin: Number(stats.totalPayin ?? 0),
      totalPayout: Number(stats.totalPayout ?? 0),
      countPayin: Number(stats.countPayin ?? 0),
      countPayout: Number(stats.countPayout ?? 0),
    };
  }
}
