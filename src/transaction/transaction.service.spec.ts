/**
 * Le taux de frais effectivement appliqué est celui porté par
 * `transactionData.taxRateOverride` — un champ STRICTEMENT serveur, posé après
 * résolution de la méthode de paiement (`taxesPayment`/`taxesTransfer`).
 *
 * Ce test verrouille la régression d'origine : `createTransaction` calculait un
 * taux depuis l'override mais passait `undefined` au calcul, si bien que TOUS les
 * flux payaient le taux système, quel que soit le taux de la méthode.
 */
import { TransactionService } from './transaction.service';

/**
 * Construit le service avec 15 doublures. On n'exerce que le chemin « frais
 * actifs » : modèle de transaction (capture du payload), système (taux global),
 * et le strict nécessaire pour que le constructeur soit satisfait.
 */
function build(
  systemInvoiceTaxes: number,
  options?: { gateway?: any; profilePayer?: 'customer' | 'organization' },
) {
  const transactionModel = {
    create: jest.fn((payload: any) => Promise.resolve({ ...payload })),
    findById: jest.fn(),
  };
  const systemService = {
    getSystemData: jest.fn(async () => ({ invoiceTaxes: systemInvoiceTaxes })),
  };
  const commissionResolver = {
    getCommissionPayer: jest.fn(
      async () => options?.profilePayer ?? 'customer',
    ),
  };

  const service = new TransactionService(
    transactionModel as any, // transactionModel
    {} as any, // payoutModel
    {
      findById: jest.fn(() => ({
        lean: () => ({ exec: async () => options?.gateway ?? null }),
      })),
    } as any, // gatewayModel
    {} as any, // httpService
    {} as any, // payinService
    systemService as any, // systemService
    {} as any, // operationNotificationService
    {} as any, // paymentRequestService
    {} as any, // servicePaymentService
    {} as any, // balanceService
    {} as any, // flutterwaveApi
    {} as any, // flutterwaveService
    {} as any, // auditLogService
    {} as any, // systemBalanceService
    commissionResolver as any, // commissionResolver
  );

  return { service, transactionModel };
}

const BASE = {
  estimation: 1000,
  noFees: false,
  commissionPayer: 'customer' as const,
  transactionType: 'deposite',
  status: 'transaction_payin_pending',
};

describe('TransactionService.createTransaction — taux de frais', () => {
  it('applique taxRateOverride (méthode) au lieu du taux système', async () => {
    const { service, transactionModel } = build(5);

    const saved = await service.createTransaction({
      ...BASE,
      taxRateOverride: 2,
    });

    expect(transactionModel.create).toHaveBeenCalledTimes(1);
    expect(saved.invoiceTaxes).toBe('2');
    expect(saved.taxesAmount).toBe('20'); // 1000 * 2%
  });

  it('retombe sur invoiceTaxes système sans override', async () => {
    const { service } = build(5);

    const saved = await service.createTransaction({ ...BASE });

    expect(saved.invoiceTaxes).toBe('5');
    expect(saved.taxesAmount).toBe('50'); // 1000 * 5%
  });

  it('n’expose pas taxRateOverride dans le document persisté', async () => {
    const { service } = build(5);

    const saved = await service.createTransaction({
      ...BASE,
      taxRateOverride: 2,
    });

    expect(saved.taxRateOverride).toBeUndefined();
  });

  it('force les frais côté client pour un transfert, même si le profil dit organisation', async () => {
    const { service } = build(5, {
      gateway: { providerCommission: 2 },
      profilePayer: 'organization',
    });

    const saved = await service.createTransaction({
      ...BASE,
      // Pas de commissionPayer explicite : la résolution profil renverrait
      // « organization », puis le forçage transfert doit repasser à « customer ».
      commissionPayer: undefined,
      senderId: 'user-1',
      transactionType: 'transfer',
      taxRateOverride: 2,
      gatewayId: '507f1f77bcf86cd799439011',
    });

    expect(saved.commissionPayer).toBe('customer');
    // 1000 + 2% (20) = 1020, + 2% de commission (21) = 1041.
    expect(saved.paymentWithTaxes).toBe('1041');
  });

  it('respecte le profil organisation hors transfert', async () => {
    const { service } = build(5, {
      gateway: { providerCommission: 2 },
      profilePayer: 'organization',
    });

    const saved = await service.createTransaction({
      ...BASE,
      commissionPayer: undefined,
      senderId: 'user-1',
      taxRateOverride: 2,
      gatewayId: '507f1f77bcf86cd799439011',
    });

    expect(saved.commissionPayer).toBe('organization');
    // L'organisation absorbe taxes + commission : le client paie l'estimation.
    expect(saved.paymentWithTaxes).toBe('1000');
  });
});
