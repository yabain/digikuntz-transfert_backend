import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

interface Entry {
  key: string;
  response?: any;
  inProgress?: boolean;
}

/**
 * In-memory stand-in for the IdempotencyRecord model. It enforces the unique
 * `key` index (code 11000) and implements only the calls the service makes.
 */
function buildModel() {
  const store = new Map<string, Entry>();
  const duplicateKeyError = () =>
    Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

  return {
    store,
    create: jest.fn(async (doc: Entry) => {
      if (store.has(doc.key)) throw duplicateKeyError();
      store.set(doc.key, { ...doc });
      return doc;
    }),
    findOne: jest.fn((filter: { key: string }) => ({
      lean: async () => {
        const entry = store.get(filter.key);
        return entry ? { ...entry } : null;
      },
    })),
    findOneAndUpdate: jest.fn((filter: { key: string }, update: Partial<Entry>) => ({
      exec: async () => {
        const entry = store.get(filter.key);
        if (!entry) return null;
        Object.assign(entry, update);
        return { ...entry };
      },
    })),
    deleteOne: jest.fn((filter: { key: string; inProgress?: boolean }) => ({
      exec: async () => {
        const entry = store.get(filter.key);
        if (entry && (filter.inProgress === undefined || entry.inProgress === filter.inProgress)) {
          store.delete(filter.key);
        }
        return { acknowledged: true };
      },
    })),
  };
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('IdempotencyService.processKey', () => {
  let model: ReturnType<typeof buildModel>;
  let service: IdempotencyService;

  beforeEach(() => {
    model = buildModel();
    service = new IdempotencyService(model as any);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the stored response for the same key and scope without re-running fn', async () => {
    const first = await service.processKey('k1', async () => ({ id: 'tx-1' }), 'user-1');

    const replayFn = jest.fn(async () => ({ id: 'tx-2' }));
    const replay = await service.processKey('k1', replayFn, 'user-1');

    expect(first).toEqual({ id: 'tx-1' });
    expect(replay).toEqual({ id: 'tx-1' });
    expect(replayFn).not.toHaveBeenCalled();
    expect(model.store.get('user-1:k1')).toMatchObject({
      response: { id: 'tx-1' },
      inProgress: false,
    });
  });

  it('runs both calls when two different scopes use the same key', async () => {
    const fnA = jest.fn(async () => 'result-A');
    const fnB = jest.fn(async () => 'result-B');

    const a = await service.processKey('shared-key', fnA, 'user-1');
    const b = await service.processKey('shared-key', fnB, 'user-2');

    expect(a).toBe('result-A');
    expect(b).toBe('result-B');
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    expect(model.store.has('user-1:shared-key')).toBe(true);
    expect(model.store.has('user-2:shared-key')).toBe(true);
  });

  it('rejects a concurrent duplicate with ConflictException while the first call is in progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = service.processKey(
      'k-busy',
      async () => {
        await gate;
        return { ok: true };
      },
      'user-1',
    );
    await flushPromises();

    const duplicateFn = jest.fn(async () => ({ ok: 'second' }));
    await expect(service.processKey('k-busy', duplicateFn, 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(duplicateFn).not.toHaveBeenCalled();

    release();
    await expect(first).resolves.toEqual({ ok: true });

    const afterCompletion = jest.fn(async () => ({ ok: 'third' }));
    await expect(service.processKey('k-busy', afterCompletion, 'user-1')).resolves.toEqual({
      ok: true,
    });
    expect(afterCompletion).not.toHaveBeenCalled();
  });

  it('removes the reservation when fn fails so a retry executes again', async () => {
    const fn = jest
      .fn<Promise<{ id: string }>, []>()
      .mockRejectedValueOnce(new Error('upstream boom'))
      .mockResolvedValueOnce({ id: 'tx-retry' });

    await expect(service.processKey('k-fail', fn, 'user-1')).rejects.toThrow('upstream boom');
    expect(model.store.has('user-1:k-fail')).toBe(false);

    await expect(service.processKey('k-fail', fn, 'user-1')).resolves.toEqual({ id: 'tx-retry' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keeps the reservation in progress when fn fails with preserveReservationOnFailure: retry is blocked until TTL', async () => {
    const fn = jest.fn<Promise<{ id: string }>, []>().mockRejectedValue(new Error('upstream boom'));

    await expect(
      service.processKey('k-fail-preserve', fn, 'user-1', { preserveReservationOnFailure: true }),
    ).rejects.toThrow('upstream boom');

    // Reservation is still there and in progress: a retry hits 409.
    await expect(service.processKey('k-fail-preserve', fn, 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(fn).toHaveBeenCalledTimes(1);
    const entry = model.store.get('user-1:k-fail-preserve');
    expect(entry?.inProgress).toBe(true);
    expect(entry?.response).toBeUndefined();
  });

  it('rejects Idempotency-Key longer than 255 characters', async () => {
    const longKey = 'a'.repeat(256);
    await expect(service.processKey(longKey, async () => ({}), 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(model.create).not.toHaveBeenCalled();
  });

  it('isolates the same key between two routes of the same user', async () => {
    const fnTransaction = jest.fn(async () => ({ id: 'tx-1' }));
    const fnDirectCharge = jest.fn(async () => ({ id: 'tx-2' }));

    const a = await service.processKey('shared-key', fnTransaction, 'user-1:transaction');
    const b = await service.processKey('shared-key', fnDirectCharge, 'user-1:direct-charge');

    expect(a).toEqual({ id: 'tx-1' });
    expect(b).toEqual({ id: 'tx-2' });
    expect(fnTransaction).toHaveBeenCalledTimes(1);
    expect(fnDirectCharge).toHaveBeenCalledTimes(1);
  });

  it('returns the result but keeps retries blocked when the completion write fails', async () => {
    model.findOneAndUpdate.mockImplementationOnce(() => ({
      exec: async () => {
        throw new Error('db unavailable');
      },
    }));

    await expect(service.processKey('k-complete', async () => ({ id: 'tx-9' }), 'user-1')).resolves.toEqual({
      id: 'tx-9',
    });
    await expect(service.processKey('k-complete', async () => ({ id: 'tx-10' }), 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('runs fn on every call and stores nothing when no key is provided', async () => {
    const fn = jest.fn(async () => ({ id: 'tx-x' }));

    await service.processKey(undefined, fn, 'user-1');
    await service.processKey(undefined, fn, 'user-1');

    expect(fn).toHaveBeenCalledTimes(2);
    expect(model.create).not.toHaveBeenCalled();
    expect(model.store.size).toBe(0);
  });
});
