import { BadRequestException, Injectable, ConflictException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IdempotencyRecord } from './idempotency.schema';

const DUPLICATE_KEY_ERROR = 11000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectModel(IdempotencyRecord.name)
    private readonly idempotencyModel: Model<IdempotencyRecord>,
  ) {}

  /**
   * Runs `fn` at most once per `(scope, key)` within the record TTL.
   *
   * - No `key`: `fn` is called as-is, nothing is stored.
   * - `scope` (namespaced caller identity, typically `${userId}:${route}`) namespaces
   *   the stored key, so two callers or two endpoints never share a response.
   * - The reservation is inserted before `fn` runs (the unique index on `key`
   *   makes this atomic). A concurrent duplicate hits 11000 and gets a 409
   *   while the first call is still in progress, or the stored response once done.
   * - If `fn` throws and the caller did not mark the operation as "side-effect
   *   safe to retry" (`preserveReservationOnFailure: true`), the reservation is
   *   removed so the client can retry. For money-moving operations (direct charge,
   *   payout) the flag is set: a failure after the provider/debit side effect must
   *   NOT allow an immediate re-execution.
   * - If `fn` throws with `preserveReservationOnFailure: true`, the reservation
   *   stays `inProgress`, so retries get a 409 until the TTL expires (24h).
   */
  async processKey<T>(
    key: string | undefined,
    fn: () => Promise<T>,
    scope?: string,
    options?: { preserveReservationOnFailure?: boolean },
  ): Promise<T> {
    if (!key) return fn();
    if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must not exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      );
    }

    const storedKey = scope ? `${scope}:${key}` : key;

    try {
      await this.idempotencyModel.create({ key: storedKey, inProgress: true });
    } catch (err: any) {
      if (err?.code !== DUPLICATE_KEY_ERROR) throw err;
      const existing = await this.idempotencyModel.findOne({ key: storedKey }).lean();
      // Reservation vanished between the insert and the read: treat as in progress.
      if (!existing || existing.inProgress === true) {
        throw new ConflictException('Request with this Idempotency-Key is still in progress');
      }
      return existing.response as T;
    }

    let result: T;
    try {
      result = await fn();
    } catch (err) {
      if (!options?.preserveReservationOnFailure) {
        await this.idempotencyModel
          .deleteOne({ key: storedKey, inProgress: true })
          .exec()
          .catch((cleanupErr: any) =>
            this.logger.error(
              `Idempotency reservation cleanup failed after error: ${cleanupErr?.message || cleanupErr}`,
            ),
          );
      } else {
        this.logger.warn(
          `Idempotency reservation kept in progress after error for key=${storedKey} (retry blocked until TTL)`,
        );
      }
      throw err;
    }

    try {
      await this.idempotencyModel
        .findOneAndUpdate({ key: storedKey }, { response: result, inProgress: false })
        .exec();
    } catch (err: any) {
      // The operation already happened: return its result. The reservation stays
      // in progress, so a retry gets 409 until the TTL expires instead of re-running it.
      this.logger.error(
        `Idempotency record could not be completed; retries are blocked until TTL: ${err?.message || err}`,
      );
    }
    return result;
  }
}
