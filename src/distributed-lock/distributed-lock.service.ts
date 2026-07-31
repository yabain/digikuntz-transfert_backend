import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { DistributedLock } from './distributed-lock.schema';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(
    @InjectModel(DistributedLock.name)
    private readonly lockModel: Model<DistributedLock>,
  ) {}

  /**
   * Acquire a cluster-wide lock. Returns an owner token on success, null if busy.
   */
  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const owner = `${process.pid}-${randomBytes(8).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(ttlMs, 1000));

    // Best-effort cleanup of expired lock for this key (TTL index is async).
    await this.lockModel
      .deleteMany({ key, expiresAt: { $lte: now } })
      .exec()
      .catch(() => undefined);

    try {
      await this.lockModel.create({ key, owner, expiresAt });
      return owner;
    } catch (error: any) {
      if (error?.code === 11000) {
        return null;
      }
      throw error;
    }
  }

  async release(key: string, owner: string): Promise<void> {
    await this.lockModel.deleteOne({ key, owner }).exec().catch(() => undefined);
  }

  /**
   * Run `fn` under a distributed lock. Returns undefined if the lock was not acquired.
   */
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    const owner = await this.acquire(key, ttlMs);
    if (!owner) {
      this.logger.debug(`Lock busy: ${key}`);
      return undefined;
    }
    try {
      return await fn();
    } finally {
      await this.release(key, owner);
    }
  }
}
