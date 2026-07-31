import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IdempotencyRecord } from './idempotency.schema';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectModel(IdempotencyRecord.name)
    private readonly idempotencyModel: Model<IdempotencyRecord>,
  ) {}

  async processKey<T>(key: string | undefined, fn: () => Promise<T>): Promise<T> {
    if (!key) return fn();

    const existing = await this.idempotencyModel.findOne({ key }).lean();
    if (existing) return existing.response as T;

    const result = await fn();
    try {
      await this.idempotencyModel.create({ key, response: result });
    } catch (err: any) {
      if (err?.code === 11000) {
        const created = await this.idempotencyModel.findOne({ key }).lean();
        return created!.response as T;
      }
    }
    return result;
  }
}
