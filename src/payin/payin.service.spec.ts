/**
 * Specs for the direct-charge primitives and the Flutterwave webhook.
 *
 * These methods are load-bearing for money movements: `createPendingPayin` is the
 * idempotency anchor, `attachChargeResult` is the only writer of a charge outcome,
 * and `verifyWebhook` is what turns a Flutterwave notification into a credit.
 *
 * The service is instantiated directly with a mocked model so the FAILING Mongo
 * filters can be asserted. A mock that merely resolves would hide whether the
 * guard clauses are still present — and those guards are exactly what prevents a
 * charge from being replayed or a terminal payin from being resurrected.
 */
import { UnauthorizedException } from '@nestjs/common';
import { PayinService } from './payin.service';
import {
  PayinProvider,
  PayinStatus,
  WebhookVerificationResult,
} from './payin.schema';

/** Chainable Mongoose model mock; every query method returns `this`. */
interface ModelMock {
  create: jest.Mock;
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
  find: jest.Mock;
  sort: jest.Mock;
  limit: jest.Mock;
  exec: jest.Mock;
}

type WebhookBody = { event: string; data: Record<string, unknown> };
type MongoFilter = Record<string, unknown>;
type MongoUpdate = Record<string, unknown>;
type FindOneAndUpdateArgs = [MongoFilter, MongoUpdate];

const TERMINAL_STATUSES = [
  PayinStatus.SUCCESSFUL,
  PayinStatus.FAILED,
  PayinStatus.CANCELLED,
];

function createModelMock(): ModelMock {
  const model: ModelMock = {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    exec: jest.fn(),
  };

  model.findOne.mockReturnValue(model);
  model.findOneAndUpdate.mockReturnValue(model);
  model.find.mockReturnValue(model);
  model.sort.mockReturnValue(model);
  model.limit.mockReturnValue(model);

  return model;
}

type WebhookRequest = Parameters<PayinService['verifyWebhook']>[0];
type PayinServiceArgs = ConstructorParameters<typeof PayinService>;

function createService(model: ModelMock): PayinService {
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const args = [{}, config, {}, {}, model] as unknown as PayinServiceArgs;

  return new PayinService(...args);
}

/** Filter passed to the most recent `findOneAndUpdate` call. */
function lastFilter(model: ModelMock): MongoFilter {
  const calls = model.findOneAndUpdate.mock.calls as FindOneAndUpdateArgs[];
  return calls[calls.length - 1][0];
}

/** Update document passed to the most recent `findOneAndUpdate` call. */
function lastUpdate(model: ModelMock): MongoUpdate {
  const calls = model.findOneAndUpdate.mock.calls as FindOneAndUpdateArgs[];
  return calls[calls.length - 1][1];
}

/** A webhook payload shaped like Flutterwave's. */
function webhookBody(overrides: Record<string, unknown> = {}): WebhookBody {
  return {
    event: 'charge.completed',
    data: {
      id: 987654,
      tx_ref: 'txDirect-123',
      status: 'successful',
      ...overrides,
    },
  };
}

function webhookRequest(body: WebhookBody, signature?: string): WebhookRequest {
  return {
    body,
    headers: signature === undefined ? {} : { 'verif-hash': signature },
  } as unknown as WebhookRequest;
}

describe('PayinService — direct charge primitives', () => {
  let model: ModelMock;
  let service: PayinService;

  beforeEach(() => {
    model = createModelMock();
    service = createService(model);
  });

  describe('createPendingPayin', () => {
    it('always writes an explicit pending status so the row stays reconcilable', async () => {
      // The historical bug: a payin created without an explicit status landed as
      // 'PENDING' (not a valid enum value) and was invisible to `findPending`.
      model.create.mockResolvedValue({ txRef: 'txDirect-1' });

      await service.createPendingPayin({
        txRef: 'txDirect-1',
        amount: 5000,
        currency: 'XAF',
        customerEmail: 'payer@example.com',
        transactionId: 'tx-1',
      });

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          txRef: 'txDirect-1',
          status: PayinStatus.PENDING,
          provider: PayinProvider.FLUTTERWAVE,
          meta: {},
        }),
      );
    });

    it('keeps the originating flow in meta so the cron can apply the short window', async () => {
      model.create.mockResolvedValue({ txRef: 'txDirect-2' });

      await service.createPendingPayin({
        txRef: 'txDirect-2',
        amount: 100,
        currency: 'XAF',
        customerEmail: 'payer@example.com',
        transactionId: 'tx-2',
        channel: 'mobile_money',
        meta: { flow: 'invoice' },
      });

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: { flow: 'invoice' },
          channel: 'mobile_money',
        }),
      );
    });

    it('returns the existing payin on a duplicate txRef (idempotent retry)', async () => {
      const existing = { txRef: 'txDirect-3', status: PayinStatus.PENDING };
      model.create.mockRejectedValue({ code: 11000 });
      model.exec.mockResolvedValue(existing);

      const result = await service.createPendingPayin({
        txRef: 'txDirect-3',
        amount: 5000,
        currency: 'XAF',
        customerEmail: 'payer@example.com',
        transactionId: 'tx-3',
      });

      expect(result).toBe(existing);
      expect(model.findOne).toHaveBeenCalledWith({ txRef: 'txDirect-3' });
    });

    it('propagates any error that is not a duplicate key', async () => {
      model.create.mockRejectedValue(new Error('connection reset'));

      await expect(
        service.createPendingPayin({
          txRef: 'txDirect-4',
          amount: 5000,
          currency: 'XAF',
          customerEmail: 'payer@example.com',
          transactionId: 'tx-4',
        }),
      ).rejects.toThrow('connection reset');
    });
  });

  describe('attachChargeResult', () => {
    it('scopes the write to the owning transaction so a charge cannot land elsewhere', async () => {
      // Structural guard: even with a wrong `txRef`, the filter includes the
      // transaction, so a charge can never be attached to a foreign payin (and
      // therefore never credited against that other transaction's amount).
      model.exec.mockResolvedValue({ txRef: 'txDirect-5' });

      await service.attachChargeResult('txDirect-5', 'tx-5', { flwTxId: 4242 });

      expect(lastFilter(model)).toMatchObject({
        txRef: 'txDirect-5',
        transactionId: 'tx-5',
      });
    });

    it('skips undefined fields instead of nulling stored values', async () => {
      model.exec.mockResolvedValue({ txRef: 'txDirect-5' });

      await service.attachChargeResult('txDirect-5', 'tx-5', { flwTxId: 4242 });

      const update = lastUpdate(model);

      expect(update).toEqual({ flwTxId: '4242' });
      expect(update).not.toHaveProperty('raw');
      expect(update).not.toHaveProperty('status');
      expect(update).not.toHaveProperty('error');
    });

    it('never downgrades a payin that already reached a terminal status', async () => {
      // Replaying a stale `pending` response after the webhook finalised the payin
      // would put it back in the cron queue and replay the charge.
      model.exec.mockResolvedValue({ txRef: 'txDirect-6' });

      await service.attachChargeResult('txDirect-6', 'tx-6', {
        status: PayinStatus.PENDING,
      });

      expect(lastFilter(model).status).toEqual({ $nin: TERMINAL_STATUSES });
    });

    it('does not guard terminal writes, so a real failure can still be recorded', async () => {
      model.exec.mockResolvedValue({ txRef: 'txDirect-7' });

      await service.attachChargeResult('txDirect-7', 'tx-7', {
        status: PayinStatus.FAILED,
        error: { message: 'CHARGE_ERROR' },
      });

      expect(lastFilter(model).status).toBeUndefined();
      expect(lastUpdate(model).status).toBe(PayinStatus.FAILED);
      expect(lastUpdate(model).error).toEqual({ message: 'CHARGE_ERROR' });
    });

    it('returns the row untouched when there is nothing to write', async () => {
      model.exec.mockResolvedValue({ txRef: 'txDirect-8' });

      await service.attachChargeResult('txDirect-8', 'tx-8', {});

      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
      expect(model.findOne).toHaveBeenCalledWith({
        txRef: 'txDirect-8',
        transactionId: 'tx-8',
      });
    });
  });

  describe('findPendingDirectCharges', () => {
    it('scopes to direct-charge flows so the hosted window is untouched', async () => {
      model.exec.mockResolvedValue([]);

      await service.findPendingDirectCharges(25);

      expect(model.find).toHaveBeenCalledWith({
        status: PayinStatus.PENDING,
        'meta.flow': { $in: ['direct_charge', 'payment_request', 'invoice'] },
      });
      expect(model.sort).toHaveBeenCalledWith({ createdAt: 1 });
      expect(model.limit).toHaveBeenCalledWith(25);
    });
  });
});

describe('PayinService — verifyWebhook', () => {
  let model: ModelMock;
  let service: PayinService;

  beforeEach(() => {
    model = createModelMock();
    service = createService(model);
    service.setCredentials({ secretHash: 'configured-hash' });
  });

  it('rejects a delivery with no signature', async () => {
    await expect(
      service.verifyWebhook(webhookRequest(webhookBody())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unknown signature', async () => {
    await expect(
      service.verifyWebhook(webhookRequest(webhookBody(), 'forged')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts the configured hash', async () => {
    model.exec.mockResolvedValue({ txRef: 'txDirect-123' });

    const result = await service.verifyWebhook(
      webhookRequest(webhookBody(), 'configured-hash'),
    );

    expect(result.status).toBe('ok');
    expect(result.payin).toEqual({ txRef: 'txDirect-123' });
  });

  it('accepts a hash belonging to another gateway of the same account', async () => {
    // Regression: `secretHash` is only populated once a charge has run on this
    // process, so a webhook arriving after a restart was rejected with 401 and a
    // real payment was silently dropped.
    model.exec.mockResolvedValue({ txRef: 'txDirect-123' });

    const result = await service.verifyWebhook(
      webhookRequest(webhookBody(), 'other-gateway-hash'),
      ['other-gateway-hash'],
    );

    expect(result.status).toBe('ok');
  });

  it('never accepts an empty signature just because no hash is configured', async () => {
    const bare = createService(createModelMock());

    await expect(
      bare.verifyWebhook(webhookRequest(webhookBody(), '')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ignores a non charge.completed event', async () => {
    const result = await service.verifyWebhook(
      webhookRequest(
        { event: 'transfer.completed', data: { id: 1, tx_ref: 'tx-1' } },
        'configured-hash',
      ),
    );

    expect(result.ignored).toBe('event:transfer.completed');
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('marks a failed charge instead of silently dropping it', async () => {
    // Previously only `status === 'successful'` was handled, so a failed charge
    // was acknowledged while the payin stayed pending until the cron closed it.
    model.exec.mockResolvedValue({ txRef: 'txDirect-123' });

    await service.verifyWebhook(
      webhookRequest(
        webhookBody({
          status: 'failed',
          processor_response: 'Insufficient funds',
        }),
        'configured-hash',
      ),
    );

    expect(lastUpdate(model).status).toBe(PayinStatus.FAILED);
    expect(lastUpdate(model).error).toEqual({
      source: 'flutterwave-webhook',
      message: 'Insufficient funds',
      status: 'failed',
    });
    // The terminal guard is what makes duplicate deliveries idempotent.
    expect(lastFilter(model).status).toEqual({ $nin: TERMINAL_STATUSES });
  });

  it('never overwrites a terminal payin with a late success', async () => {
    model.exec.mockResolvedValue(null);

    await service.verifyWebhook(
      webhookRequest(webhookBody(), 'configured-hash'),
    );

    expect(lastUpdate(model).status).toBe(PayinStatus.SUCCESSFUL);
    expect(lastFilter(model).status).toEqual({ $nin: TERMINAL_STATUSES });
  });

  it('matches on the Flutterwave id as well as tx_ref', async () => {
    model.exec.mockResolvedValue({ txRef: 'txDirect-123' });

    await service.verifyWebhook(
      webhookRequest(webhookBody(), 'configured-hash'),
    );

    expect(lastFilter(model).$or).toEqual(
      expect.arrayContaining([{ flwTxId: 987654 }, { txRef: 'txDirect-123' }]),
    );
  });

  it('ignores a status it cannot act on', async () => {
    const result = await service.verifyWebhook(
      webhookRequest(webhookBody({ status: 'pending' }), 'configured-hash'),
    );

    expect(result.ignored).toBe('status:pending');
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('ignores a delivery carrying no identifier at all', async () => {
    const result = await service.verifyWebhook(
      webhookRequest(
        { event: 'charge.completed', data: { status: 'successful' } },
        'configured-hash',
      ),
    );

    expect(result.ignored).toBe('missing_identifiers');
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('falls back to tx_ref alone when the Flutterwave id is absent', async () => {
    model.exec.mockResolvedValue({ txRef: 'txDirect-123' });

    await service.verifyWebhook(
      webhookRequest(
        {
          event: 'charge.completed',
          data: { tx_ref: 'txDirect-123', status: 'successful' },
        },
        'configured-hash',
      ),
    );

    expect(lastFilter(model).$or).toEqual([{ txRef: 'txDirect-123' }]);
  });

  it('keeps the result contract explicit for callers', async () => {
    model.exec.mockResolvedValue(null);

    const result: WebhookVerificationResult = await service.verifyWebhook(
      webhookRequest(webhookBody(), 'configured-hash'),
    );

    expect(result).toEqual({ status: 'ok', payin: null });
  });
});
