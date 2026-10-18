/**
 * Guards the single most dangerous decision in the direct-charge path: what to do
 * when the charge call fails.
 *
 * A transport/upstream failure is AMBIGUOUS — the request may have reached
 * Flutterwave and succeeded while the response was lost. Marking the payin
 * terminal `failed` in that case is silent money loss: the reconciliation cron
 * only scans `pending` payins and the webhook ignores terminal ones, so the real
 * success could never be credited back to the invoice.
 *
 * These tests pin the rule: only a failure PROVEN to have happened before any
 * request left the process (a pre-charge rejection) may be written as terminal.
 */
import { BadRequestException, HttpException } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { PayinStatus } from 'src/payin/payin.schema';

type ServiceArgs = ConstructorParameters<typeof FlutterwaveService>;

/** 0-based index of `PayinService` in the constructor. */
const PAYIN_ARG_INDEX = 4;
/** 0-based index of `ConfigService` in the constructor. */
const CONFIG_ARG_INDEX = 17;
/** The constructor takes 23 collaborators; only two matter here. */
const CONSTRUCTOR_ARITY = 23;

interface PayinServiceStub {
  attachChargeResult: jest.Mock;
}

/** Shape of the patch `recordChargeFailure` writes when it does finalise a payin. */
interface AttachPatch {
  status?: string;
  error?: { code?: string; message?: string };
}

/**
 * Last patch handed to `attachChargeResult`.
 *
 * `jest.Mock` is untyped (`any[][]`), so the call arguments are re-typed explicitly
 * here instead of being read as `any` — the repo lints `no-unsafe-*` as errors.
 */
function lastPatch(stub: PayinServiceStub): AttachPatch {
  const calls = stub.attachChargeResult.mock.calls as unknown as Array<
    [string, string, AttachPatch]
  >;
  return calls[calls.length - 1][2];
}

/**
 * Builds the service with inert collaborators.
 *
 * Safe because `recordChargeFailure` only ever touches `payinService` and its own
 * logger.
 */
function buildService(
  payinService: PayinServiceStub,
  env: Record<string, string> = {},
): FlutterwaveService {
  const args = new Array<unknown>(CONSTRUCTOR_ARITY).fill({});
  args[PAYIN_ARG_INDEX] = payinService;
  args[CONFIG_ARG_INDEX] = { get: jest.fn((key: string) => env[key]) };

  return new FlutterwaveService(...(args as unknown as ServiceArgs));
}

function stubPayinService(): PayinServiceStub {
  return { attachChargeResult: jest.fn().mockResolvedValue({ txRef: 'x' }) };
}

/** A rejection the builder itself produced, before any HTTP call. */
function preChargeRejection(code: string): HttpException {
  return new HttpException({ message: `rejected: ${code}`, code }, 400);
}

describe('FlutterwaveService.recordChargeFailure', () => {
  it('leaves the payin PENDING when the failure is ambiguous, so it stays reconcilable', async () => {
    const payinService = stubPayinService();
    const service = buildService(payinService);

    // The classic ambiguous outcome: the charge may well have succeeded and the
    // response was lost. Writing `failed` here would discard the payment forever.
    await service.recordChargeFailure(
      'txDirect-1',
      'tx-1',
      new Error('socket hang up'),
    );

    expect(payinService.attachChargeResult).not.toHaveBeenCalled();
  });

  it('leaves the payin PENDING on a timeout as well', async () => {
    const payinService = stubPayinService();
    const service = buildService(payinService);

    const timeout = new Error('timeout of 30000ms exceeded');
    timeout.name = 'TimeoutError';

    await service.recordChargeFailure('txDirect-2', 'tx-2', timeout);

    expect(payinService.attachChargeResult).not.toHaveBeenCalled();
  });

  it('leaves the payin PENDING on an unlabelled upstream 4xx', async () => {
    const payinService = stubPayinService();
    const service = buildService(payinService);

    // Flutterwave refusing the charge is *probably* harmless, but nothing in the
    // error proves no money moved, and being slow is far cheaper than losing a
    // payment. The cron resolves it against `verify_by_reference`.
    await service.recordChargeFailure(
      'txDirect-3',
      'tx-3',
      new BadRequestException('charge declined'),
    );

    expect(payinService.attachChargeResult).not.toHaveBeenCalled();
  });

  it('writes the payin terminal FAILED for a proven pre-charge rejection', async () => {
    const payinService = stubPayinService();
    const service = buildService(payinService);

    await service.recordChargeFailure(
      'txDirect-4',
      'tx-4',
      preChargeRejection('NETWORK_NOT_RESOLVED'),
    );

    expect(payinService.attachChargeResult).toHaveBeenCalledTimes(1);
    expect(payinService.attachChargeResult).toHaveBeenCalledWith(
      'txDirect-4',
      'tx-4',
      expect.anything(),
    );

    const patch = lastPatch(payinService);
    expect(patch.status).toBe(PayinStatus.FAILED);
    expect(patch.error?.code).toBe('NETWORK_NOT_RESOLVED');
  });

  it('records the owning transaction, never a bare txRef', async () => {
    // Structural guard: without the transaction id in the write filter a charge
    // outcome could land on another transaction's payin.
    const payinService = stubPayinService();
    const service = buildService(payinService);

    await service.recordChargeFailure(
      'txDirect-5',
      'tx-5',
      preChargeRejection('INVALID_PHONE'),
    );

    expect(payinService.attachChargeResult).toHaveBeenCalledWith(
      'txDirect-5',
      'tx-5',
      expect.anything(),
    );
  });
});
