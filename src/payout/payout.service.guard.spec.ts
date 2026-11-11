/**
 * Garde des statuts terminaux (SUCCESSFUL / FAILED) sur les écritures de statut
 * du payout : `updatePayoutStatus`, `forceFailStuckPayout` et `updateLocalByRef`.
 *
 * Le modèle en mémoire évalue réellement le filtre `status: { $nin: [...] }`,
 * pour que le test prouve la garde et non un mock qui la contourne.
 */
import { Logger } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutStatus } from './payout.schema';
import { TStatus } from 'src/transaction/transaction.schema';

const REFERENCE = 'ref-1';
const TRANSACTION_ID = 'tx-1';

interface PayoutRow {
  reference: string;
  status: string;
  transactionId?: string;
}

function buildPayoutModel(initial: PayoutRow) {
  const rows = new Map<string, PayoutRow>([[initial.reference, { ...initial }]]);

  const matches = (row: PayoutRow, filter: any): boolean => {
    if (filter.reference !== undefined && row.reference !== filter.reference) return false;
    const excluded: string[] | undefined = filter.status?.$nin;
    if (excluded && excluded.includes(row.status)) return false;
    return true;
  };

  return {
    rows,
    findOne: jest.fn((filter: any) => ({
      exec: async () => {
        const row = [...rows.values()].find((r) => matches(r, filter));
        return row ? { ...row } : null;
      },
    })),
    findOneAndUpdate: jest.fn((filter: any, update: Partial<PayoutRow>, options: { new?: boolean } = {}) => ({
      exec: async () => {
        const row = [...rows.values()].find((r) => matches(r, filter));
        if (!row) return null;
        const before = { ...row };
        Object.assign(row, update);
        return options.new ? { ...row } : before;
      },
    })),
  };
}

function buildService(initial: PayoutRow) {
  const payoutModel = buildPayoutModel(initial);
  const transactionService = {
    updateTransactionStatus: jest.fn().mockResolvedValue({ transactionType: 'apiCall' }),
  };
  const service = new PayoutService(
    {} as any, // mpesaService
    payoutModel as any,
    transactionService as any,
    {} as any, // emailService
    {} as any, // operationNotificationService
    {} as any, // paystackService
    {} as any, // flutterwaveApi
  );
  return { service, payoutModel, transactionService };
}

describe('PayoutService terminal-status guard', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not overwrite a SUCCESSFUL payout with FAILED via updatePayoutStatus', async () => {
    const { service, payoutModel } = buildService({
      reference: REFERENCE,
      status: PayoutStatus.SUCCESSFUL,
      transactionId: TRANSACTION_ID,
    });

    const current = await service.updatePayoutStatus(REFERENCE, PayoutStatus.FAILED);

    expect(payoutModel.rows.get(REFERENCE)?.status).toBe(PayoutStatus.SUCCESSFUL);
    expect(current).toMatchObject({ reference: REFERENCE, status: PayoutStatus.SUCCESSFUL });
  });

  it('applies updatePayoutStatus to a non-terminal payout and returns the updated document', async () => {
    const { service, payoutModel } = buildService({
      reference: REFERENCE,
      status: PayoutStatus.PROCESSING,
      transactionId: TRANSACTION_ID,
    });

    const updated = await service.updatePayoutStatus(REFERENCE, PayoutStatus.SUCCESSFUL);

    expect(payoutModel.rows.get(REFERENCE)?.status).toBe(PayoutStatus.SUCCESSFUL);
    expect(updated).toMatchObject({ status: PayoutStatus.SUCCESSFUL });
  });

  it('returns null only when the reference does not exist', async () => {
    const { service } = buildService({ reference: REFERENCE, status: PayoutStatus.PROCESSING });

    await expect(service.updatePayoutStatus('unknown-ref', PayoutStatus.FAILED)).resolves.toBeNull();
  });

  it('forceFailStuckPayout leaves a SUCCESSFUL payout and its transaction untouched', async () => {
    const { service, payoutModel, transactionService } = buildService({
      reference: REFERENCE,
      status: PayoutStatus.SUCCESSFUL,
      transactionId: TRANSACTION_ID,
    });

    const current = await service.forceFailStuckPayout(REFERENCE, TRANSACTION_ID);

    expect(payoutModel.rows.get(REFERENCE)?.status).toBe(PayoutStatus.SUCCESSFUL);
    expect(current).toMatchObject({ status: PayoutStatus.SUCCESSFUL });
    expect(transactionService.updateTransactionStatus).not.toHaveBeenCalled();
  });

  it('forceFailStuckPayout fails a stuck payout and marks its transaction PAYOUTERROR', async () => {
    const { service, payoutModel, transactionService } = buildService({
      reference: REFERENCE,
      status: PayoutStatus.PROCESSING,
      transactionId: TRANSACTION_ID,
    });

    await service.forceFailStuckPayout(REFERENCE, TRANSACTION_ID);

    expect(payoutModel.rows.get(REFERENCE)?.status).toBe(PayoutStatus.FAILED);
    expect(transactionService.updateTransactionStatus).toHaveBeenCalledWith(
      TRANSACTION_ID,
      TStatus.PAYOUTERROR,
    );
  });

  it('updateLocalByRef does not overwrite a FAILED payout when a status is provided', async () => {
    const { service, payoutModel } = buildService({
      reference: REFERENCE,
      status: PayoutStatus.FAILED,
    });

    const res = await (service as any).updateLocalByRef(
      REFERENCE,
      { status: PayoutStatus.PROCESSING },
      { new: true },
    );

    expect(payoutModel.rows.get(REFERENCE)?.status).toBe(PayoutStatus.FAILED);
    expect(res).toMatchObject({ status: PayoutStatus.FAILED });
  });
});
