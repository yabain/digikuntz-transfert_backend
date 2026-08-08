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
   *
   * Le mouvement peut déjà exister en `status: 'pending'` (créé lors de la
   * création du payin) : on le passe alors à `completed` et on applique le
   * crédit une seule fois. S'il n'existe pas encore, il est créé complété.
   */
  async creditSystemBalance(
    currency: string,
    amount: number,
    idempotencyKey?: string,
    meta?: {
      reference?: string;
      description?: string;
      transactionId?: string;
      amountCollected?: number;
      gatewayFee?: number;
      providerCommission?: number;
      amountCredited?: number;
      performedBy?: { userId?: string; name?: string; email?: string };
    },
  ): Promise<SystemBalance> {
    const cur = this.normalizeCurrency(currency);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid credit amount');
    }

    await this.getSystemBalance(cur);

    const key =
      idempotencyKey ||
      `system-credit:${new mongoose.Types.ObjectId().toString()}`;

    const setFields: any = {
      status: 'completed',
      amount,
      reference: meta?.reference ?? '',
      description: meta?.description ?? '',
      amountCollected: meta?.amountCollected ?? 0,
      gatewayFee: meta?.gatewayFee ?? 0,
      providerCommission: meta?.providerCommission ?? 0,
      amountCredited: meta?.amountCredited ?? amount,
      performedBy: meta?.performedBy ?? null,
    };

    // 1) Le mouvement existe déjà en `pending` (payin créé) : on le complète
    //    et on applique le crédit une seule fois (le payin étant maintenant
    //    confirmé). `status != completed` couvre aussi failed/cancelled.
    const completed = await this.systemBalanceMovementModel
      .findOneAndUpdate(
        { key, status: { $ne: 'completed' } },
        { $set: setFields },
        { new: true },
      )
      .exec();

    if (completed) {
      return this.systemBalanceModel
        .findOneAndUpdate(
          { currency: cur },
          { $inc: { balance: amount } },
          { new: true, runValidators: true },
        )
        .exec() as Promise<SystemBalance>;
    }

    // 2) Déjà complété → idempotent, aucun double crédit.
    const existing = await this.systemBalanceMovementModel
      .findOne({ key })
      .exec();
    if (existing) {
      return this.getSystemBalance(cur);
    }

    // 3) Jamais créé (recharge legacy, crédit manuel...) : création + crédit.
    try {
      await this.systemBalanceMovementModel.create({
        key,
        type: 'in',
        amount,
        currency: cur,
        transactionId: meta?.transactionId ?? null,
        ...setFields,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        // Course : un autre process a créé le mouvement → pas de double crédit.
        return this.getSystemBalance(cur);
      }
      throw error;
    }

    return this.systemBalanceModel
      .findOneAndUpdate(
        { currency: cur },
        { $inc: { balance: amount } },
        { new: true, runValidators: true },
      )
      .exec() as Promise<SystemBalance>;
  }

  /**
   * Debit system balance atomically (`balance >= amount`).
   * Optional idempotency key. Même logique que le crédit : un mouvement
   * `pending` existant est complété puis le débit est appliqué une seule fois.
   */
  async debitSystemBalance(
    currency: string,
    amount: number,
    idempotencyKey?: string,
    meta?: {
      reference?: string;
      description?: string;
      transactionId?: string;
      amountCollected?: number;
      gatewayFee?: number;
      providerCommission?: number;
      amountCredited?: number;
      performedBy?: { userId?: string; name?: string; email?: string };
    },
  ): Promise<SystemBalance> {
    const cur = this.normalizeCurrency(currency);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid debit amount');
    }

    await this.getSystemBalance(cur);

    const key =
      idempotencyKey ||
      `system-debit:${new mongoose.Types.ObjectId().toString()}`;

    const setFields: any = {
      status: 'completed',
      amount,
      reference: meta?.reference ?? '',
      description: meta?.description ?? '',
      amountCollected: meta?.amountCollected ?? amount,
      gatewayFee: meta?.gatewayFee ?? 0,
      providerCommission: meta?.providerCommission ?? 0,
      amountCredited: meta?.amountCredited ?? amount,
      performedBy: meta?.performedBy ?? null,
    };

    const completed = await this.systemBalanceMovementModel
      .findOneAndUpdate(
        { key, status: { $ne: 'completed' } },
        { $set: setFields },
        { new: true },
      )
      .exec();

    if (completed) {
      return this.systemBalanceModel
        .findOneAndUpdate(
          { currency: cur, balance: { $gte: amount } },
          { $inc: { balance: -amount } },
          { new: true, runValidators: true },
        )
        .exec() as Promise<SystemBalance>;
    }

    const existing = await this.systemBalanceMovementModel
      .findOne({ key })
      .exec();
    if (existing) {
      return this.getSystemBalance(cur);
    }

    try {
      await this.systemBalanceMovementModel.create({
        key,
        type: 'out',
        amount,
        currency: cur,
        transactionId: meta?.transactionId ?? null,
        ...setFields,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        return this.getSystemBalance(cur);
      }
      throw error;
    }

    return this.systemBalanceModel
      .findOneAndUpdate(
        { currency: cur, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, runValidators: true },
      )
      .exec() as Promise<SystemBalance>;
  }

  /**
   * Crée un mouvement de solde en `status: 'pending'` (ex. à la création d'un
   * payin de recharge). Aucun impact sur le solde : il n'est crédité qu'à la
   * confirmation (`creditSystemBalance` passe le mouvement à `completed`).
   */
  async createPendingMovement(data: {
    key: string;
    type: 'in' | 'out';
    amount: number;
    currency: string;
    transactionId?: string;
    reference?: string;
    description?: string;
    amountCollected?: number;
    gatewayFee?: number;
    providerCommission?: number;
    amountCredited?: number;
    performedBy?: { userId?: string; name?: string; email?: string };
  }): Promise<void> {
    const cur = this.normalizeCurrency(data.currency);
    try {
      await this.systemBalanceMovementModel.create({
        key: data.key,
        type: data.type,
        amount: data.amount,
        currency: cur,
        status: 'pending',
        transactionId: data.transactionId ?? null,
        reference: data.reference ?? '',
        description: data.description ?? '',
        amountCollected: data.amountCollected ?? 0,
        gatewayFee: data.gatewayFee ?? 0,
        providerCommission: data.providerCommission ?? 0,
        amountCredited: data.amountCredited ?? data.amount,
        performedBy: data.performedBy ?? null,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        // Déjà créé (retry) → on n'écrase pas le mouvement existant.
        return;
      }
      throw error;
    }
  }

  /**
   * Passe les mouvements `pending` d'une transaction au statut final
   * (`failed`/`cancelled`). Les mouvements déjà `completed` ne sont jamais
   * rétrogradés.
   */
  async updateMovementStatusByTransaction(
    transactionId: string,
    status: string,
  ): Promise<void> {
    if (!transactionId) return;
    if (!['failed', 'cancelled'].includes(status)) return;
    await this.systemBalanceMovementModel
      .updateMany(
        { transactionId, status: 'pending' },
        { $set: { status } },
      )
      .exec();
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
    if (options.currency && !['undefined', 'null'].includes(options.currency)) {
      filter.currency = this.normalizeCurrency(options.currency);
    }
    if (options.type === 'in' || options.type === 'out') {
      filter.type = options.type;
    }
    if (
      typeof options.keyword === 'string' &&
      options.keyword.trim() &&
      !['undefined', 'null'].includes(options.keyword.trim())
    ) {
      const kw = options.keyword.trim();
      const regex = { $regex: kw, $options: 'i' };
      filter.$or = [
        { key: regex },
        { type: regex },
        { status: regex },
        { reference: regex },
        { description: regex },
        { 'performedBy.name': regex },
        { 'performedBy.email': regex },
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
      // Seuls les mouvements `completed` ont réellement impacté le solde.
      { $match: { currency: cur, status: 'completed' } },
      {
        $group: {
          _id: null,
          totalPayin: {
            $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0] },
          },
          totalPayout: {
            $sum: { $cond: [{ $eq: ['$type', 'out'] }, '$amount', 0] },
          },
          countPayin: {
            $sum: { $cond: [{ $eq: ['$type', 'in'] }, 1, 0] },
          },
          countPayout: {
            $sum: { $cond: [{ $eq: ['$type', 'out'] }, 1, 0] },
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
