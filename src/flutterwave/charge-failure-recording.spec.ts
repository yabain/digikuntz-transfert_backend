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
 * Two categories are terminal, and only two:
 *  - a PRE-CHARGE rejection (proven to happen before any request left here);
 *  - an EXPLICIT refusal by Flutterwave (4xx / `failed` envelope), which proves
 *    no charge was created and unlocks the hosted-checkout fallback.
 *
 * Everything else stays `pending` for upstream reconciliation.
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
  markChargeTerminal: jest.Mock;
}

/** Shape of the patch `recordChargeFailure` writes when it does finalise a payin. */
interface TerminalPatch {
  status?: string;
  error?: { code?: string; message?: string };
}

/**
 * Last arguments handed to `markChargeTerminal`.
 *
 * `jest.Mock` is untyped (`any[][]`), so the call arguments are re-typed explicitly
 * here instead of being read as `any` — the repo lints `no-unsafe-*` as errors.
 */
function lastCall(stub: PayinServiceStub): {
  txRef: string;
  transactionId: string;
  status: string;
  patch: TerminalPatch;
} {
  const calls = stub.markChargeTerminal.mock.calls as unknown as Array<
    [string, string, string, TerminalPatch]
  >;
  const [txRef, transactionId, status, patch] = calls[calls.length - 1];
  return { txRef, transactionId, status, patch };
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
  return { markChargeTerminal: jest.fn().mockResolvedValue({ txRef: 'x' }) };
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

    expect(payinService.markChargeTerminal).not.toHaveBeenCalled();
  });

  it('leaves the payin PENDING on a timeout as well', async () => {
    const payinService = stubPayinService();
    const service = buildService(payinService);

    const timeout = new Error('timeout of 30000ms exceeded');
    timeout.name = 'TimeoutError';

    await service.recordChargeFailure('txDirect-2', 'tx-2', timeout);

    expect(payinService.markChargeTerminal).not.toHaveBeenCalled();
  });

  it('leaves the payin PENDING on a 5xx / gateway failure', async () => {
    const payinService = stubPayinService();
    const service = buildService(payinService);

    await service.recordChargeFailure(
      'txDirect-3',
      'tx-3',
      new HttpException({ message: 'upstream' }, 502),
    );

    expect(payinService.markChargeTerminal).not.toHaveBeenCalled();
  });

  it('writes the payin terminal FAILED for a proven pre-charge rejection', async () => {
    const payinService = stubPayinService();
    const service = buildService(payinService);

    await service.recordChargeFailure(
      'txDirect-4',
      'tx-4',
      preChargeRejection('NETWORK_NOT_RESOLVED'),
    );

    expect(payinService.markChargeTerminal).toHaveBeenCalledTimes(1);
    expect(payinService.markChargeTerminal).toHaveBeenCalledWith(
      'txDirect-4',
      'tx-4',
      PayinStatus.FAILED,
      expect.anything(),
    );

    const call = lastCall(payinService);
    expect(call.status).toBe(PayinStatus.FAILED);
    expect(call.patch.error?.code).toBe('NETWORK_NOT_RESOLVED');
  });

  it('writes the payin terminal FAILED for an explicit 4xx refusal', async () => {
    // A 4xx is Flutterwave's business/validation answer: no charge exists, so the
    // payin must not stay pending (the cron would poll it forever) and the caller
    // may open the hosted checkout instead.
    const payinService = stubPayinService();
    const service = buildService(payinService);

    await service.recordChargeFailure(
      'txDirect-5',
      'tx-5',
      new BadRequestException('Account does not exist or Invalid Account'),
    );

    expect(payinService.markChargeTerminal).toHaveBeenCalledWith(
      'txDirect-5',
      'tx-5',
      PayinStatus.FAILED,
      expect.anything(),
    );
  });

  it('records the owning transaction, never a bare txRef', async () => {
    // Structural guard: without the transaction id in the write filter a charge
    // outcome could land on another transaction's payin.
    const payinService = stubPayinService();
    const service = buildService(payinService);

    await service.recordChargeFailure(
      'txDirect-6',
      'tx-6',
      preChargeRejection('INVALID_PHONE'),
    );

    expect(payinService.markChargeTerminal).toHaveBeenCalledWith(
      'txDirect-6',
      'tx-6',
      PayinStatus.FAILED,
      expect.anything(),
    );
  });
});
