/**
 * Débit + compensation de `DevService.createPayoutTransaction` (/dev/payout).
 *
 * Le débit du solde est fait avant la création de la transaction. Si celle-ci
 * échoue sans avoir été enregistrée, le débit doit être restitué exactement une
 * fois, avec une clé de compensation propre, puis l'erreur d'origine remontée.
 * Les dépendances sont des doubles `jest.fn` (aucun réseau, aucune base).
 */
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { DevService } from './dev.service';

const USER_ID = '64b000000000000000000001';
const TX_REF = 'txApiPayout-1-abcd';
const IN_REF = 'IN-REF-1';
const AMOUNT = 1000;
const CURRENCY = 'XAF';

const PAYOUT_BODY = {
  amount: AMOUNT,
  accountBankCode: 'mtn',
  accountNumber: '237691224472',
  receiverName: 'John Doe',
  currency: CURRENCY,
};

function buildHarness() {
  const transactionService = {
    validateTransactionLimit: jest.fn().mockResolvedValue(undefined),
    generateInRef: jest.fn().mockReturnValue(IN_REF),
    createTransaction: jest.fn().mockResolvedValue({
      _id: 'tx-1',
      estimation: AMOUNT,
      taxesAmount: 0,
      paymentWithTaxes: AMOUNT,
      invoiceTaxes: 0,
      raisonForTransfer: 'API Payout',
      receiverCurrency: CURRENCY,
      transactionType: 'apiCall',
      isApiPayout: true,
      createdAt: new Date('2026-11-11T10:00:00Z'),
      updatedAt: new Date('2026-11-11T10:00:00Z'),
    }),
    findByTransactionRef: jest
      .fn()
      .mockRejectedValue(new NotFoundException('transaction not found')),
  };
  const payoutService = {
    generateTxRef: jest.fn().mockReturnValue(TX_REF),
  };
  const balanceService = {
    getBalanceByUserId: jest.fn().mockResolvedValue({ balance: 5000 }),
    debitBalance: jest.fn().mockResolvedValue({}),
    creditBalance: jest.fn().mockResolvedValue({}),
  };
  const devModel = {
    findOne: jest.fn().mockResolvedValue({
      id: 'dev-1',
      userId: USER_ID,
      status: true,
      webhookUrl: '',
      secretKey: 'enc-sk',
      publicKey: 'enc-pk',
    }),
  };
  const userService = {
    getUserById: jest.fn().mockResolvedValue({
      _id: USER_ID,
      email: 'payer@example.com',
      phone: '690000000',
      countryId: { name: 'Cameroon', code: 'CM', currency: CURRENCY },
    }),
    showName: jest.fn().mockReturnValue('Jane Doe'),
  };
  const fwService = {
    notifyAdminPayoutPending: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const cryptService = {
    decryptWithPassphrase: jest.fn((value: string) => `dec-${value}`),
  };

  const service = new DevService(
    devModel as any,
    transactionService as any,
    {} as any, // payinService: non sollicité par le payout
    fwService as any,
    userService as any,
    cryptService as any,
    balanceService as any,
    payoutService as any,
    {} as any, // paymentMethodService: non sollicité par le payout
    auditLog as any,
    {} as any, // config: non sollicitée par le payout
  );

  return { service, transactionService, balanceService };
}

describe('DevService.createPayoutTransaction – debit and compensation', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debits with the per-attempt txRef as ledger key, before creating the transaction', async () => {
    const { service, balanceService, transactionService } = buildHarness();

    const result = await service.createPayoutTransaction(PAYOUT_BODY, USER_ID);

    expect(balanceService.debitBalance).toHaveBeenCalledTimes(1);
    expect(balanceService.debitBalance).toHaveBeenCalledWith(USER_ID, AMOUNT, CURRENCY, TX_REF);
    expect(
      balanceService.debitBalance.mock.invocationCallOrder[0],
    ).toBeLessThan(transactionService.createTransaction.mock.invocationCallOrder[0]);
    expect(balanceService.creditBalance).not.toHaveBeenCalled();
    expect(result.id).toBe('tx-1');
    expect(result.status).toBe('payout_pending');
  });

  it('credits the debit back exactly once and rethrows the original error when createTransaction fails', async () => {
    const { service, balanceService, transactionService } = buildHarness();
    const dbError = new Error('db unavailable');
    transactionService.createTransaction.mockRejectedValueOnce(dbError);

    await expect(service.createPayoutTransaction(PAYOUT_BODY, USER_ID)).rejects.toBe(dbError);

    expect(transactionService.findByTransactionRef).toHaveBeenCalledWith(IN_REF);
    expect(balanceService.creditBalance).toHaveBeenCalledTimes(1);
    expect(balanceService.creditBalance).toHaveBeenCalledWith(
      USER_ID,
      AMOUNT,
      CURRENCY,
      `api-payout-refund:${TX_REF}`,
    );
  });

  it('compensates when createTransaction returns no document', async () => {
    const { service, balanceService, transactionService } = buildHarness();
    transactionService.createTransaction.mockResolvedValueOnce(null);

    await expect(service.createPayoutTransaction(PAYOUT_BODY, USER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(balanceService.creditBalance).toHaveBeenCalledTimes(1);
  });

  it('does not credit back when the transaction was saved despite the error', async () => {
    const { service, balanceService, transactionService } = buildHarness();
    const timeout = new Error('socket timeout after commit');
    transactionService.createTransaction.mockRejectedValueOnce(timeout);
    transactionService.findByTransactionRef.mockResolvedValueOnce({ _id: 'tx-1' });

    await expect(service.createPayoutTransaction(PAYOUT_BODY, USER_ID)).rejects.toBe(timeout);

    expect(balanceService.creditBalance).not.toHaveBeenCalled();
  });

  it('does not credit back when the saved-check itself fails unexpectedly', async () => {
    const { service, balanceService, transactionService } = buildHarness();
    const dbError = new Error('createTransaction failed');
    transactionService.createTransaction.mockRejectedValueOnce(dbError);
    transactionService.findByTransactionRef.mockRejectedValueOnce(new Error('lookup timeout'));

    await expect(service.createPayoutTransaction(PAYOUT_BODY, USER_ID)).rejects.toBe(dbError);

    expect(balanceService.creditBalance).not.toHaveBeenCalled();
  });

  it('keeps the original error when the refund itself fails', async () => {
    const { service, balanceService, transactionService } = buildHarness();
    const dbError = new Error('createTransaction failed');
    transactionService.createTransaction.mockRejectedValueOnce(dbError);
    balanceService.creditBalance.mockRejectedValueOnce(new Error('credit failed'));

    await expect(service.createPayoutTransaction(PAYOUT_BODY, USER_ID)).rejects.toBe(dbError);

    expect(balanceService.creditBalance).toHaveBeenCalledTimes(1);
  });

  it('does not compensate when the transaction is created', async () => {
    const { service, balanceService } = buildHarness();

    await service.createPayoutTransaction(PAYOUT_BODY, USER_ID);

    expect(balanceService.creditBalance).not.toHaveBeenCalled();
  });
});
