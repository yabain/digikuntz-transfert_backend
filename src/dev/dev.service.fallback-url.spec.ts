/**
 * `fallbackUrl` par défaut du développeur (organisation) sur le flux
 * `/dev/transaction` (DevService.createPayinTransaction).
 *
 * Couvre :
 * - l'usage du `fallbackUrl` du dev comme `redirectUrl` (URL de redirection
 *   après paiement sur le checkout Flutterwave) quand la requête n'en fournit pas ;
 * - la priorité du `callbackUrl` de la requête sur le `fallbackUrl` du dev ;
 * - l'absence de `redirectUrl` quand ni la requête ni le dev n'en fournissent ;
 * - le fait que `callbackUrl` de la transaction reste le webhookUrl du dev
 *   (destiné aux notifications, pas à la redirection).
 */
import { DevService } from './dev.service';

const DEV_FALLBACK = 'https://client.example.com/payment-return';
const REQUEST_CALLBACK = 'https://client.example.com/request-callback';
const WEBHOOK = 'https://client.example.com/webhook';

function buildHarness(devOverrides: Record<string, any> = {}) {
  const transactionService = {
    validateTransactionLimit: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue({
      _id: 'tx-1',
      status: 'transaction_payin_pending',
      estimation: '100',
      transactionRef: 'IN-REF-1',
      taxesAmount: '5',
      paymentWithTaxes: '105',
      raisonForTransfer: 'Test payment',
      receiverCurrency: 'XAF',
      transactionType: 'apiCall',
      createdAt: new Date('2026-11-12T10:00:00Z'),
      updatedAt: new Date('2026-11-12T10:00:00Z'),
    }),
  };
  const devModel = {
    findOne: jest.fn().mockResolvedValue({
      id: 'dev-1',
      userId: 'user-1',
      status: true,
      webhookUrl: WEBHOOK,
      fallbackUrl: DEV_FALLBACK,
      secretKey: 'enc-sk',
      publicKey: 'enc-pk',
      ...devOverrides,
    }),
  };
  const fwService = {
    createPayin: jest.fn().mockResolvedValue({
      transactionId: 'tx-1',
      redirect_url:
        'https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-test',
    }),
  };
  const userService = {
    getUserById: jest.fn().mockResolvedValue({ commissionPayer: 'customer' }),
  };
  const cryptService = {
    decryptWithPassphrase: jest.fn((value: string) => `dec-${value}`),
  };
  const payinService = {
    generateTxRef: jest.fn((prefix: string) => `${prefix}-1`),
  };
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue(undefined) };

  const service = new DevService(
    devModel as any,
    transactionService as any,
    payinService as any,
    fwService as any,
    userService as any,
    cryptService as any,
    {} as any, // balanceService
    {} as any, // payoutService
    {} as any, // paymentMethodService
    auditLog as any,
    config as any,
  );

  return { service, transactionService, devModel, fwService };
}

describe('DevService.createPayinTransaction — fallbackUrl par défaut du dev', () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    harness = buildHarness();
  });

  function payload(overrides: Record<string, any> = {}) {
    return {
      estimation: 100,
      transactionType: 'apiCall',
      receiverId: 'user-1',
      raisonForTransfer: 'Test payment',
      senderId: 'user-1',
      senderName: 'API Call: Kevin',
      senderEmail: 'email@example.com',
      senderContact: '691224472',
      senderCountry: 'Cameroon',
      senderCurrency: 'XAF',
      receiverName: 'Kevin',
      receiverEmail: 'email@example.com',
      receiverContact: '691224472',
      receiverCurrency: 'XAF',
      status: 'transaction_payin_pending',
      ...overrides,
    };
  }

  it('utilise le fallbackUrl du dev comme redirectUrl quand la requête n’en fournit pas', async () => {
    const { service, fwService } = harness;

    const result = await service.createPayinTransaction(payload(), 'user-1');

    // Le redirectUrl envoyé à Flutterwave (checkout hébergé) est le fallbackUrl du dev.
    expect(fwService.createPayin).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUrl: DEV_FALLBACK }),
      'user-1',
    );
    // Le callbackUrl de la transaction reste le webhookUrl du dev (notifications).
    expect(fwService.createPayin).toHaveBeenCalledWith(
      expect.objectContaining({ callbackUrl: WEBHOOK }),
      'user-1',
    );
    expect((result as any).data.paymentLink).toBe(
      'https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-test',
    );
  });

  it('priorise le callbackUrl de la requête sur le fallbackUrl du dev', async () => {
    const { service, fwService } = harness;

    await service.createPayinTransaction(
      payload({ callbackUrl: REQUEST_CALLBACK }),
      'user-1',
    );

    expect(fwService.createPayin).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUrl: REQUEST_CALLBACK }),
      'user-1',
    );
  });

  it('n’envoie aucun redirectUrl quand ni la requête ni le dev n’en fournissent', async () => {
    harness = buildHarness({ fallbackUrl: '' });
    const { service, fwService } = harness;

    await service.createPayinTransaction(payload(), 'user-1');

    const arg = (fwService.createPayin as jest.Mock).mock.calls[0][0];
    expect((arg as any).redirectUrl).toBeUndefined();
  });
});
