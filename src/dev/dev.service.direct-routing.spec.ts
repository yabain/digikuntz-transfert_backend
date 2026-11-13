/**
 * Routage de la charge directe `/dev/direct-charge` (DevService.createDirectPayinTransaction).
 *
 * Couvre la sélection de la méthode d'encaissement :
 * - sans `paymentMethodCode` : méthode Flutterwave active dont le code correspond
 *   à l'opérateur du numéro (résolveur réel, pas de mock) ;
 * - avec `paymentMethodCode` : validations historiques (404/400) ;
 * - bornes min/max du montant ;
 * - repli vers le checkout hébergé après refus de la charge directe.
 *
 * Les dépendances sont des doubles `jest.fn` construits à la main : seuls les
 * appels observables (méthode choisie, réseau envoyé, transaction créée ou non)
 * sont asserts.
 */
import { HttpException, HttpStatus } from '@nestjs/common';
import { DevService } from './dev.service';
import { PayinStatus } from 'src/payin/payin.schema';
import { TStatus } from 'src/transaction/transaction.schema';

const ORANGE_NUMBER = '691224472'; // 69x → ORANGEMONEY (CM, XAF)
const MTN_NUMBER = '650000000'; // 650 → MTN (CM, XAF)
const UNASSIGNED_NUMBER = '611111111'; // 9 chiffres, préfixe non alloué → NETWORK_NOT_RESOLVED

const flutterwaveGateway = { type: 'flutterwave' };

function payinMethod(overrides: Record<string, any> = {}) {
  return {
    code: 'ORANGEMONEY',
    currency: 'XAF',
    statusPayin: true,
    statusPayout: true,
    minAmount: 0,
    maxAmount: 0,
    gatewayId: flutterwaveGateway,
    ...overrides,
  };
}

const ORANGE_METHOD = payinMethod();
const MTN_METHOD = payinMethod({ code: 'MTN' });

function payload(overrides: Record<string, any> = {}) {
  return {
    estimation: 1000,
    currency: 'XAF',
    phone: ORANGE_NUMBER,
    email: 'payer@example.com',
    name: 'Jane Doe',
    ...overrides,
  };
}

async function captureError(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

function buildHarness() {
  const transactionService = {
    validateTransactionLimit: jest.fn().mockResolvedValue(undefined),
    generateInRef: jest.fn().mockReturnValue('IN-REF-1'),
    createTransaction: jest.fn().mockImplementation(async (data: any) => ({
      _id: 'tx-1',
      estimation: data.estimation,
      taxesAmount: 20,
      paymentWithTaxes: 1020,
      invoiceTaxes: 2,
      status: TStatus.PAYINPENDING,
      createdAt: new Date('2026-11-11T10:00:00Z'),
      updatedAt: new Date('2026-11-11T10:00:00Z'),
    })),
    updateTransactionFlwTxId: jest.fn().mockResolvedValue(undefined),
  };
  const payinService = {
    generateTxRef: jest.fn().mockReturnValue('txDirect-1'),
    createPendingPayin: jest.fn().mockResolvedValue({}),
  };
  const fwService = {
    directMobileMoneyCharge: jest
      .fn()
      .mockResolvedValue({ status: 'success', data: { id: 99, status: 'pending' } }),
    recordChargeResult: jest
      .fn()
      .mockResolvedValue({ status: PayinStatus.PENDING, flwTxId: '99' }),
    recordChargeFailure: jest.fn().mockResolvedValue(undefined),
    fallbackToHostedAfterDirectRefusal: jest.fn().mockResolvedValue(null),
    processSuccessfulPayin: jest.fn().mockResolvedValue(undefined),
  };
  const paymentMethodService = {
    findActivePayinByCurrency: jest.fn().mockResolvedValue([]),
    findByCode: jest.fn().mockResolvedValue(null),
  };
  const devModel = {
    findOne: jest.fn().mockResolvedValue({
      id: 'dev-1',
      userId: 'user-1',
      status: true,
      webhookUrl: '',
      fallbackUrl: '',
      secretKey: 'enc-sk',
      publicKey: 'enc-pk',
    }),
  };
  const userService = {
    getUserById: jest.fn().mockResolvedValue({ commissionPayer: 'customer' }),
  };
  const cryptService = {
    decryptWithPassphrase: jest.fn((value: string) => `dec-${value}`),
  };
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn((key: string) => (key === 'DIRECT_CHARGE_ENABLED' ? 'true' : undefined)),
  };

  const service = new DevService(
    devModel as any,
    transactionService as any,
    payinService as any,
    fwService as any,
    userService as any,
    cryptService as any,
    {} as any, // balanceService: non sollicité par ce flux
    {} as any, // payoutService: non sollicité par ce flux
    paymentMethodService as any,
    auditLog as any,
    config as any,
  );

  return {
    service,
    transactionService,
    payinService,
    fwService,
    paymentMethodService,
    devModel,
  };
}

describe('DevService.createDirectPayinTransaction — routage de méthode', () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    harness = buildHarness();
  });

  describe('sans paymentMethodCode (sélection par opérateur)', () => {
    it('sélectionne ORANGEMONEY pour un numéro 69x et envoie ce réseau à Flutterwave', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([
        MTN_METHOD,
        ORANGE_METHOD,
      ]);

      const result = await harness.service.createDirectPayinTransaction(
        payload({ phone: ORANGE_NUMBER }),
        'user-1',
      );

      expect(harness.paymentMethodService.findActivePayinByCurrency).toHaveBeenCalledWith('XAF');
      expect(harness.fwService.directMobileMoneyCharge).toHaveBeenCalledTimes(1);
      expect(harness.fwService.directMobileMoneyCharge).toHaveBeenCalledWith(
        expect.objectContaining({ network: 'ORANGEMONEY', currency: 'XAF', phone: ORANGE_NUMBER }),
      );
      expect(result.data.paymentMethodCode).toBe('ORANGEMONEY');
      // Succès de la charge : pas de drapeau de repli.
      expect(result.data).not.toHaveProperty('chargeStatus');
      expect(result.data).not.toHaveProperty('paymentLink');
    });

    it.each([MTN_NUMBER, '670123456', '685000000'])(
      'sélectionne MTN pour le numéro %s et envoie MTN à Flutterwave',
      async (phone) => {
        harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([
          ORANGE_METHOD,
          MTN_METHOD,
        ]);

        const result = await harness.service.createDirectPayinTransaction(
          payload({ phone }),
          'user-1',
        );

        expect(harness.fwService.directMobileMoneyCharge).toHaveBeenCalledWith(
          expect.objectContaining({ network: 'MTN', phone }),
        );
        expect(result.data.paymentMethodCode).toBe('MTN');
      },
    );

    it('ignore les méthodes dont la passerelle n’est pas Flutterwave', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([
        payinMethod({ gatewayId: { type: 'orange_cm' } }),
      ]);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(payload(), 'user-1'),
      );

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({ code: 'NO_ACTIVE_PAYIN_METHOD' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();
      expect(harness.fwService.directMobileMoneyCharge).not.toHaveBeenCalled();
    });

    it('refuse avec NO_ACTIVE_PAYIN_METHOD quand aucune méthode n’est active pour la devise', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([]);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(payload(), 'user-1'),
      );

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({ code: 'NO_ACTIVE_PAYIN_METHOD' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();
    });

    it('refuse avec NO_ACTIVE_PAYIN_METHOD quand seul MTN est actif pour un numéro Orange', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([MTN_METHOD]);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(payload({ phone: ORANGE_NUMBER }), 'user-1'),
      );

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({ code: 'NO_ACTIVE_PAYIN_METHOD' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();
      expect(harness.fwService.directMobileMoneyCharge).not.toHaveBeenCalled();
    });

    it('refuse avec le code du résolveur pour un numéro trop court, sans créer de transaction', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([ORANGE_METHOD]);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(payload({ phone: '12345' }), 'user-1'),
      );

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({ code: 'INVALID_PHONE' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();
      expect(harness.fwService.directMobileMoneyCharge).not.toHaveBeenCalled();
    });

    it('propage NETWORK_NOT_RESOLVED pour un préfixe non alloué', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([
        ORANGE_METHOD,
        MTN_METHOD,
      ]);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(
          payload({ phone: UNASSIGNED_NUMBER }),
          'user-1',
        ),
      );

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({ code: 'NETWORK_NOT_RESOLVED' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();
    });
  });

  describe('avec paymentMethodCode explicite', () => {
    it('accepte ORANGEMONEY en XAF sans interroger la liste des méthodes actives', async () => {
      harness.paymentMethodService.findByCode.mockResolvedValue(ORANGE_METHOD);

      const result = await harness.service.createDirectPayinTransaction(
        payload({ paymentMethodCode: 'ORANGEMONEY', currency: 'XAF' }),
        'user-1',
      );

      expect(harness.paymentMethodService.findByCode).toHaveBeenCalledWith('ORANGEMONEY');
      expect(harness.paymentMethodService.findActivePayinByCurrency).not.toHaveBeenCalled();
      expect(harness.fwService.directMobileMoneyCharge).toHaveBeenCalledWith(
        expect.objectContaining({ network: 'ORANGEMONEY', currency: 'XAF' }),
      );
      expect(result.data.paymentMethodCode).toBe('ORANGEMONEY');
    });

    it('refuse CURRENCY_MISMATCH quand la devise du payload diffère de la méthode', async () => {
      harness.paymentMethodService.findByCode.mockResolvedValue(ORANGE_METHOD);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(
          payload({ paymentMethodCode: 'ORANGEMONEY', currency: 'NGN' }),
          'user-1',
        ),
      );

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({ code: 'CURRENCY_MISMATCH' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();
      expect(harness.fwService.directMobileMoneyCharge).not.toHaveBeenCalled();
    });

    it('refuse METHOD_NOT_FOUND (404) quand le code est inconnu', async () => {
      harness.paymentMethodService.findByCode.mockResolvedValue(null);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(
          payload({ paymentMethodCode: 'UNKNOWN' }),
          'user-1',
        ),
      );

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(error.getResponse()).toMatchObject({ code: 'METHOD_NOT_FOUND' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();
    });

    it('refuse METHOD_DISABLED quand la méthode n’est pas ouverte au payin', async () => {
      harness.paymentMethodService.findByCode.mockResolvedValue(
        payinMethod({ statusPayin: false }),
      );

      const error = await captureError(
        harness.service.createDirectPayinTransaction(
          payload({ paymentMethodCode: 'ORANGEMONEY' }),
          'user-1',
        ),
      );

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({ code: 'METHOD_DISABLED' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();
    });
  });

  describe('bornes min/max du montant', () => {
    it('refuse AMOUNT_BELOW_MIN sous le minimum de la méthode, sans créer de transaction', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([
        payinMethod({ minAmount: 500 }),
      ]);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(payload({ estimation: 100 }), 'user-1'),
      );

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({ code: 'AMOUNT_BELOW_MIN' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();
      expect(harness.fwService.directMobileMoneyCharge).not.toHaveBeenCalled();
    });

    it('accepte un montant égal au minimum (borne incluse)', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([
        payinMethod({ minAmount: 500 }),
      ]);

      const result = await harness.service.createDirectPayinTransaction(
        payload({ estimation: 500 }),
        'user-1',
      );

      expect(result.data.paymentMethodCode).toBe('ORANGEMONEY');
      expect(harness.fwService.directMobileMoneyCharge).toHaveBeenCalledTimes(1);
    });

    it('refuse AMOUNT_EXCEEDS_MAX au-dessus du maximum, et accepte le maximum exact', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([
        payinMethod({ maxAmount: 5000 }),
      ]);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(payload({ estimation: 5001 }), 'user-1'),
      );
      expect(error.getResponse()).toMatchObject({ code: 'AMOUNT_EXCEEDS_MAX' });
      expect(harness.transactionService.createTransaction).not.toHaveBeenCalled();

      await harness.service.createDirectPayinTransaction(payload({ estimation: 5000 }), 'user-1');
      expect(harness.fwService.directMobileMoneyCharge).toHaveBeenCalledTimes(1);
    });

    it('traite 0 comme « pas de borne » pour min et max', async () => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([
        payinMethod({ minAmount: 0, maxAmount: 0 }),
      ]);

      await harness.service.createDirectPayinTransaction(payload({ estimation: 1 }), 'user-1');

      expect(harness.fwService.directMobileMoneyCharge).toHaveBeenCalledTimes(1);
    });
  });

  describe('repli vers le checkout hébergé après refus de la charge directe', () => {
    const HOSTED_URL = 'https://checkout.flutterwave.test/pay/hosted-abc';

    beforeEach(() => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([ORANGE_METHOD]);
      harness.fwService.directMobileMoneyCharge.mockRejectedValue(
        new HttpException({ message: 'Transaction Failed' }, HttpStatus.BAD_REQUEST),
      );
      harness.fwService.fallbackToHostedAfterDirectRefusal.mockResolvedValue({
        txRef: 'hosted-tx-1',
        redirect_url: HOSTED_URL,
        status: 'pending',
        chargeStatus: 'fallback_hosted',
        fallback: { from: 'direct', reason: 'DIRECT_CHARGE_REFUSED', directTxRef: 'txDirect-1' },
        directCharge: { message: 'Transaction Failed' },
      });
    });

    it('renvoie chargeStatus=failed et paymentLink égal à redirect_url hébergé', async () => {
      const result = await harness.service.createDirectPayinTransaction(payload(), 'user-1');

      expect(harness.fwService.recordChargeFailure).toHaveBeenCalledWith(
        'txDirect-1',
        'tx-1',
        expect.any(HttpException),
      );
      expect(harness.fwService.fallbackToHostedAfterDirectRefusal).toHaveBeenCalledWith(
        expect.objectContaining({ directTxRef: 'txDirect-1', flow: 'direct_charge' }),
      );
      expect(result.data.chargeStatus).toBe('failed');
      expect(result.data.paymentLink).toBe(HOSTED_URL);
      expect(result.data.redirect_url).toBe(HOSTED_URL);
      expect(result.data.paymentMethodCode).toBe('ORANGEMONEY');
      expect(result.data.fallback).toMatchObject({ from: 'direct' });
      expect(result.data.directCharge).toEqual({ message: 'Transaction Failed' });
    });

    it('relance l’erreur Flutterwave d’origine quand aucun repli n’est possible', async () => {
      harness.fwService.fallbackToHostedAfterDirectRefusal.mockResolvedValue(null);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(payload(), 'user-1'),
      );

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getResponse()).toMatchObject({ message: 'Transaction Failed' });
      expect(harness.fwService.recordChargeFailure).toHaveBeenCalledTimes(1);
    });
  });

  describe('fallbackUrl par défaut du développeur (organisation)', () => {
    const DEV_FALLBACK = 'https://client.example.com/payment-return';
    const REQUEST_CALLBACK = 'https://client.example.com/request-callback';

    beforeEach(() => {
      harness.paymentMethodService.findActivePayinByCurrency.mockResolvedValue([ORANGE_METHOD]);
    });

    it('utilise le fallbackUrl du dev comme redirectUrl du repli hébergé quand la requête n’en fournit pas', async () => {
      harness.devModel.findOne.mockResolvedValue({
        id: 'dev-1',
        userId: 'user-1',
        status: true,
        webhookUrl: '',
        fallbackUrl: DEV_FALLBACK,
        secretKey: 'enc-sk',
        publicKey: 'enc-pk',
      });
      harness.fwService.directMobileMoneyCharge.mockRejectedValue(
        new HttpException({ message: 'Transaction Failed' }, HttpStatus.BAD_REQUEST),
      );
      harness.fwService.fallbackToHostedAfterDirectRefusal.mockResolvedValue({
        txRef: 'hosted-tx-1',
        redirect_url: 'https://checkout.flutterwave.test/pay/hosted-abc',
        status: 'pending',
        chargeStatus: 'fallback_hosted',
        fallback: { from: 'direct', reason: 'DIRECT_CHARGE_REFUSED', directTxRef: 'txDirect-1' },
        directCharge: { message: 'Transaction Failed' },
      });

      const result = await harness.service.createDirectPayinTransaction(payload(), 'user-1');

      expect(harness.fwService.fallbackToHostedAfterDirectRefusal).toHaveBeenCalledWith(
        expect.objectContaining({ redirectUrl: DEV_FALLBACK }),
      );
      expect(result.data.paymentLink).toBe('https://checkout.flutterwave.test/pay/hosted-abc');
    });

    it('priorise le callbackUrl de la requête sur le fallbackUrl du dev', async () => {
      harness.devModel.findOne.mockResolvedValue({
        id: 'dev-1',
        userId: 'user-1',
        status: true,
        webhookUrl: '',
        fallbackUrl: DEV_FALLBACK,
        secretKey: 'enc-sk',
        publicKey: 'enc-pk',
      });

      await harness.service.createDirectPayinTransaction(
        payload({ callbackUrl: REQUEST_CALLBACK }),
        'user-1',
      );

      expect(harness.fwService.directMobileMoneyCharge).toHaveBeenCalledTimes(1);
      expect(harness.transactionService.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ callbackUrl: REQUEST_CALLBACK }),
      );
    });

    it('sans fallbackUrl du dev ni callbackUrl de la requête, aucun redirectUrl n’est envoyé', async () => {
      harness.fwService.directMobileMoneyCharge.mockRejectedValue(
        new HttpException({ message: 'Transaction Failed' }, HttpStatus.BAD_REQUEST),
      );
      harness.fwService.fallbackToHostedAfterDirectRefusal.mockResolvedValue(null);

      const error = await captureError(
        harness.service.createDirectPayinTransaction(payload(), 'user-1'),
      );

      expect(harness.fwService.fallbackToHostedAfterDirectRefusal).toHaveBeenCalledWith(
        expect.not.objectContaining({ redirectUrl: expect.anything() }),
      );
      expect(error).toBeInstanceOf(HttpException);
    });
  });
});
