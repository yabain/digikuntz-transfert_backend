/**
 * Tests de l'aiguillage unique des encaissements (direct / hébergé).
 *
 * Ce service remplace deux copies de la même règle monétaire (facture et demande
 * de paiement). Deux propriétés y sont donc critiques, et ce sont elles que ces
 * tests vérifient :
 *
 * 1. **Une erreur ambiguë ne bascule JAMAIS vers l'hébergé.** Un timeout, un 5xx
 *    ou un socket coupé signifient que la charge a peut-être abouti : replier
 *    ferait payer deux fois. Seul un rejet pré-charge autorise le repli.
 * 2. **Le repli est débrayable**, et quand il l'est, l'erreur remonte telle
 *    quelle (diagnostic) au lieu d'ouvrir silencieusement un autre flux.
 *
 * Le mode direct n'est jamais atteint par un paiement carte : c'est le seul cas où
 * l'hébergé est choisi sans tentative préalable.
 */
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlutterwaveService } from './flutterwave.service';
import { PayinRouteService, PayinPayer } from './payin-route.service';

/** Doublure de la passerelle : on n'observe que les appels, rien n'est envoyé. */
interface GatewaySpy {
  createPayin: jest.Mock;
  createDirectPayin: jest.Mock;
  createHostedPayinForTransaction: jest.Mock;
}

interface NativeServiceSpy {
  setCredentials: jest.Mock;
  getAccessToken: jest.Mock;
  initPay: jest.Mock;
  pay: jest.Mock;
  getStatus: jest.Mock;
  newXReferenceId: jest.Mock;
  requestToPay: jest.Mock;
}

interface Harness {
  service: PayinRouteService;
  gateway: GatewaySpy;
  payinService: {
    generateTxRef: jest.Mock;
    createPendingPayin: jest.Mock;
    markChargeTerminal: jest.Mock;
  };
  transactionService: { createTransaction: jest.Mock };
  orangeCmService: NativeServiceSpy;
  mtnCmService: NativeServiceSpy;
}

function build(
  env: Record<string, string> = {},
  overrides: {
    gatewayType?: 'orange_cm' | 'mtn_cm';
    pendingPayinMeta?: Record<string, unknown>;
  } = {},
): Harness {
  const gateway: GatewaySpy = {
    createPayin: jest.fn(),
    createDirectPayin: jest.fn(),
    createHostedPayinForTransaction: jest.fn(async () => ({
      status: 'pending',
      transactionId: 'tx-1',
      txRef: 'txPayin-fallback',
      redirect_url: 'https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-test',
    })),
  };

  const configService = {
    get: jest.fn((key: string) => env[key]),
  };

  const payinService = {
    generateTxRef: jest.fn(() => 'txNative-1'),
    createPendingPayin: jest.fn(async (dto: any) => ({
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      provider: dto.provider,
      status: 'pending',
      meta: { ...(dto.meta ?? {}), ...(overrides.pendingPayinMeta ?? {}) },
    })),
    markChargeTerminal: jest.fn(async () => ({ txRef: 'txNative-1' })),
  };

  const transactionService = {
    createTransaction: jest.fn(async (data: any) => ({
      _id: 'tx-1',
      paymentWithTaxes: Number(data?.estimation ?? 0) + 100,
    })),
  };

  const orangeCmService: NativeServiceSpy = {
    setCredentials: jest.fn(),
    getAccessToken: jest.fn().mockResolvedValue('token-orange'),
    initPay: jest.fn().mockResolvedValue({ payToken: 'pay-token-1' }),
    pay: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn(),
    newXReferenceId: jest.fn(),
    requestToPay: jest.fn(),
  };

  const mtnCmService: NativeServiceSpy = {
    setCredentials: jest.fn(),
    getAccessToken: jest.fn(),
    initPay: jest.fn(),
    pay: jest.fn(),
    getStatus: jest.fn(),
    newXReferenceId: jest.fn(
      () => '11111111-1111-4111-8111-111111111111',
    ),
    requestToPay: jest.fn().mockResolvedValue(undefined),
  };

  const cryptService = {
    decryptWithPassphrase: jest.fn(() => '{}'),
  };
  const nativeGatewayDoc = {
    _id: 'gw-native',
    type: overrides.gatewayType ?? 'orange_cm',
    currency: 'XAF',
    credentials: 'encrypted',
  };
  const gatewayModel = {
    findById: jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(nativeGatewayDoc) }),
    findOne: jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(nativeGatewayDoc) }),
  };
  const payinModel = { updateOne: jest.fn().mockResolvedValue({}) };

  const service = new PayinRouteService(
    gateway as unknown as FlutterwaveService,
    configService as unknown as ConfigService,
    payinService as any,
    transactionService as any,
    orangeCmService as any,
    mtnCmService as any,
    cryptService as any,
    gatewayModel as any,
    payinModel as any,
  );

  return {
    service,
    gateway,
    payinService,
    transactionService,
    orangeCmService,
    mtnCmService,
  };
}

/** Construit un rejet que `isPreChargeRejection` reconnaît comme tel. */
function preChargeRejection(code: string): HttpException {
  return new HttpException({ message: `rejected: ${code}`, code }, 400);
}

const TRANSACTION = { estimation: 5000, invoiceId: 'inv-1' };
const CONTEXT = { flow: 'invoice', label: 'Invoice inv-1' } as const;

describe('PayinRouteService', () => {
  describe('choix du mode', () => {
    it('va directement à l’hébergé pour une carte, sans tenter la voie directe', async () => {
      const { service, gateway } = build();
      gateway.createPayin.mockResolvedValue({ redirect_url: 'https://pay' });

      const payer: PayinPayer = { method: 'card' };
      const result = await service.resolve(TRANSACTION, payer, CONTEXT);

      expect(result).toMatchObject({ redirect_url: 'https://pay' });
      expect(gateway.createPayin).toHaveBeenCalledTimes(1);
      expect(gateway.createDirectPayin).not.toHaveBeenCalled();
    });

    it('traite une méthode absente comme l’hébergé (comportement historique)', async () => {
      const { service, gateway } = build();
      gateway.createPayin.mockResolvedValue({ redirect_url: 'https://pay' });

      await service.resolve(TRANSACTION, {}, CONTEXT);

      expect(gateway.createDirectPayin).not.toHaveBeenCalled();
      expect(gateway.createPayin).toHaveBeenCalledTimes(1);
    });

    it('utilise la voie directe quand le mobile money aboutit', async () => {
      const { service, gateway } = build();
      gateway.createDirectPayin.mockResolvedValue({ chargeStatus: 'pending' });

      const result = await service.resolve(
        TRANSACTION,
        { method: 'mobile_money', phone: '237650000000' },
        CONTEXT,
      );

      expect(result).toMatchObject({ chargeStatus: 'pending' });
      expect(gateway.createDirectPayin).toHaveBeenCalledTimes(1);
      expect(gateway.createPayin).not.toHaveBeenCalled();
    });

    it('transmet `userId` à l’hébergé, et `undefined` pour la facture', async () => {
      const { service, gateway } = build();
      gateway.createPayin.mockResolvedValue({});

      await service.payHosted(TRANSACTION, {
        flow: 'payment_request',
        userId: 'user-9',
        label: 'Payment request',
      });
      expect(gateway.createPayin).toHaveBeenLastCalledWith(
        TRANSACTION,
        'user-9',
      );

      await service.payHosted(TRANSACTION, CONTEXT);
      expect(gateway.createPayin).toHaveBeenLastCalledWith(
        TRANSACTION,
        undefined,
      );
    });
  });

  describe('repli vers l’hébergé', () => {
    it('replie sur un rejet PRÉ-CHARGE quand le repli est actif', async () => {
      const { service, gateway } = build({
        DIRECT_CHARGE_FALLBACK_HOSTED: 'true',
      });
      gateway.createDirectPayin.mockRejectedValue(
        preChargeRejection('UNSUPPORTED_CURRENCY'),
      );
      gateway.createPayin.mockResolvedValue({ redirect_url: 'https://pay' });

      const result = await service.resolve(
        TRANSACTION,
        { method: 'mobile_money', phone: '237650000000' },
        CONTEXT,
      );

      expect(result).toMatchObject({ redirect_url: 'https://pay' });
      expect(gateway.createPayin).toHaveBeenCalledTimes(1);
    });

    it('replie aussi quand la variable est absente (repli actif par défaut)', async () => {
      const { service, gateway } = build({});
      gateway.createDirectPayin.mockRejectedValue(
        preChargeRejection('NETWORK_NOT_RESOLVED'),
      );
      gateway.createPayin.mockResolvedValue({ redirect_url: 'https://pay' });

      await service.resolve(
        TRANSACTION,
        { method: 'mobile_money', phone: '237650000000' },
        CONTEXT,
      );

      expect(gateway.createPayin).toHaveBeenCalledTimes(1);
    });

    it('replie sur DIRECT_CHARGE_DISABLED : le drapeau d’arrêt reste transparent', async () => {
      // C'est l'invariant du levier de rollback : drapeau fermé ⇒ la facture et la
      // demande de paiement retrouvent exactement le flux hébergé d'avant.
      const { service, gateway } = build({});
      gateway.createDirectPayin.mockRejectedValue(
        preChargeRejection('DIRECT_CHARGE_DISABLED'),
      );
      gateway.createPayin.mockResolvedValue({ redirect_url: 'https://pay' });

      await service.resolve(
        TRANSACTION,
        { method: 'mobile_money', phone: '237650000000' },
        CONTEXT,
      );

      expect(gateway.createPayin).toHaveBeenCalledTimes(1);
    });

    it('ne replie PAS quand le repli est débrayé, et remonte l’erreur telle quelle', async () => {
      const { service, gateway } = build({
        DIRECT_CHARGE_FALLBACK_HOSTED: 'false',
      });
      const rejection = preChargeRejection('AUTHORIZATION_CODE_REQUIRED');
      gateway.createDirectPayin.mockRejectedValue(rejection);

      await expect(
        service.resolve(
          TRANSACTION,
          { method: 'mobile_money', phone: '22670000000' },
          CONTEXT,
        ),
      ).rejects.toBe(rejection);

      expect(gateway.createPayin).not.toHaveBeenCalled();
    });
  });

  describe('garde-fou anti double débit', () => {
    it('ne replie JAMAIS sur une erreur ambiguë (5xx)', async () => {
      const { service, gateway } = build();
      const ambiguous = new HttpException({ message: 'upstream' }, 502);
      gateway.createDirectPayin.mockRejectedValue(ambiguous);

      await expect(
        service.resolve(
          TRANSACTION,
          { method: 'mobile_money', phone: '237650000000' },
          CONTEXT,
        ),
      ).rejects.toBe(ambiguous);

      // Le payin reste `pending` et sera réconcilié par `tx_ref` ; ouvrir
      // l'hébergé ici pourrait faire payer le payeur deux fois.
      expect(gateway.createPayin).not.toHaveBeenCalled();
    });

    it('ne replie JAMAIS sur un timeout / une erreur réseau', async () => {
      const { service, gateway } = build();
      gateway.createDirectPayin.mockRejectedValue(
        new Error('timeout of 30000ms exceeded'),
      );

      await expect(
        service.resolve(
          TRANSACTION,
          { method: 'mobile_money', phone: '237650000000' },
          CONTEXT,
        ),
      ).rejects.toThrow('timeout');

      expect(gateway.createPayin).not.toHaveBeenCalled();
    });

    it('ne replie JAMAIS sur une erreur d’un code inconnu', async () => {
      const { service, gateway } = build();
      const unknownCode = preChargeRejection('SOMETHING_NEW');
      gateway.createDirectPayin.mockRejectedValue(unknownCode);

      await expect(
        service.resolve(
          TRANSACTION,
          { method: 'mobile_money', phone: '237650000000' },
          CONTEXT,
        ),
      ).rejects.toBe(unknownCode);

      expect(gateway.createPayin).not.toHaveBeenCalled();
    });
  });

  describe('transmission des coordonnées du payeur', () => {
    it('mappe les champs neutres et applique l’email de repli', async () => {
      const { service, gateway } = build();
      gateway.createDirectPayin.mockResolvedValue({ chargeStatus: 'pending' });

      await service.payDirect(
        TRANSACTION,
        {
          method: 'mobile_money',
          phone: '237650000000',
          name: 'Awa N',
          network: 'MTN',
          deviceFingerprint: 'fp-1',
          clientIp: '1.2.3.4',
        },
        {
          flow: 'invoice',
          meta: { invoiceId: 'inv-1' },
          fallbackEmail: 'owner@example.com',
          label: 'Invoice inv-1',
        },
      );

      expect(gateway.createDirectPayin).toHaveBeenCalledWith(TRANSACTION, {
        phone: '237650000000',
        email: 'owner@example.com',
        name: 'Awa N',
        network: 'MTN',
        deviceFingerprint: 'fp-1',
        clientIp: '1.2.3.4',
        flow: 'invoice',
        meta: { invoiceId: 'inv-1' },
      });
    });

    it('préfère l’email du payeur au repli, et normalise un numéro absent', async () => {
      const { service, gateway } = build();
      gateway.createDirectPayin.mockResolvedValue({});

      await service.payDirect(
        TRANSACTION,
        { method: 'mobile_money', email: 'payer@example.com' },
        {
          flow: 'payment_request',
          fallbackEmail: 'ignored@example.com',
          label: 'PR',
        },
      );

      // Numéro vide plutôt qu'absent : le constructeur de charge le refuse en
      // PRÉ-charge, donc le payeur bascule sur l'hébergé au lieu d'envoyer une
      // charge sans numéro.
      expect(gateway.createDirectPayin).toHaveBeenCalledWith(
        TRANSACTION,
        expect.objectContaining({ phone: '', email: 'payer@example.com' }),
      );
    });
  });
});

describe('PayinRouteService — voie native Cameroun', () => {
  describe('routage parallèle', () => {
    it('débite via Orange quand la méthode pointe sur une passerelle orange_cm (flag actif)', async () => {
      const { service, gateway, orangeCmService, payinService, transactionService } =
        build({ NATIVE_PAYIN_ENABLED: 'true' });

      const result = await service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'orange_cm',
          phone: '237691224472', // préfixe Orange (69x)
        },
        CONTEXT,
      );

      expect(result).toMatchObject({
        provider: 'orange_cm',
        chargeStatus: 'pending',
        txRef: 'txNative-1',
      });
      // Le chemin Flutterwave n'est jamais touché.
      expect(gateway.createDirectPayin).not.toHaveBeenCalled();
      expect(gateway.createPayin).not.toHaveBeenCalled();
      // Persist-then-charge : la transaction et le payin pendent AVANT le débit.
      expect(transactionService.createTransaction).toHaveBeenCalledWith(
        TRANSACTION,
      );
      expect(payinService.createPendingPayin).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'orange_cm',
          channel: 'mobile_money',
          meta: expect.objectContaining({ flow: 'native_cm' }),
        }),
      );
      expect(orangeCmService.initPay).toHaveBeenCalledWith('token-orange');
      expect(orangeCmService.pay).toHaveBeenCalledWith(
        expect.objectContaining({
          payToken: 'pay-token-1',
          subscriberMsisdn: '237691224472',
          orderId: 'txNative-1',
        }),
      );
    });

    it('débite via MTN avec un xReferenceId UUID persisté avant requesttopay', async () => {
      const { service, gateway, mtnCmService, payinService } = build({
        NATIVE_PAYIN_ENABLED: 'true',
      });

      const result = await service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'mtn_cm',
          phone: '237671224472', // préfixe MTN (67x)
        },
        CONTEXT,
      );

      expect(result).toMatchObject({
        provider: 'mtn_cm',
        chargeStatus: 'pending',
      });
      expect(gateway.createDirectPayin).not.toHaveBeenCalled();
      expect(mtnCmService.requestToPay).toHaveBeenCalledTimes(1);
      expect(mtnCmService.requestToPay).toHaveBeenCalledWith(
        expect.objectContaining({
          externalId: 'txNative-1',
          xReferenceId: '11111111-1111-4111-8111-111111111111',
          partyId: '237671224472',
        }),
      );
      expect(payinService.createPendingPayin).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'mtn_cm',
          meta: expect.objectContaining({
            flow: 'native_cm',
            xReferenceId: '11111111-1111-4111-8111-111111111111',
          }),
        }),
      );
    });

    it('flag éteint → chemin Flutterwave historique inchangé (payDirect)', async () => {
      const { service, gateway, orangeCmService } = build({});
      gateway.createDirectPayin.mockResolvedValue({ chargeStatus: 'pending' });

      const result = await service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'orange_cm',
          phone: '237691224472',
        },
        CONTEXT,
      );

      expect(result).toMatchObject({ chargeStatus: 'pending' });
      expect(gateway.createDirectPayin).toHaveBeenCalledTimes(1);
      expect(orangeCmService.getAccessToken).not.toHaveBeenCalled();
      expect(gateway.createPayin).not.toHaveBeenCalled();
    });

    it('sans gatewayType, la voie native n’est jamais tentée', async () => {
      const { service, gateway, payinService } = build({
        NATIVE_PAYIN_ENABLED: 'true',
      });
      gateway.createDirectPayin.mockResolvedValue({ chargeStatus: 'pending' });

      await service.resolve(
        TRANSACTION,
        { method: 'mobile_money', phone: '237691224472' },
        CONTEXT,
      );

      expect(gateway.createDirectPayin).toHaveBeenCalledTimes(1);
      expect(payinService.createPendingPayin).not.toHaveBeenCalled();
    });
  });

  describe('rejet pré-charge opérateur (repli hébergé)', () => {
    it('replie en hébergé un numéro MTN saisi sur une passerelle orange_cm', async () => {
      const { service, gateway, orangeCmService } = build({
        NATIVE_PAYIN_ENABLED: 'true',
      });
      gateway.createPayin.mockResolvedValue({ redirect_url: 'https://pay' });

      const result = await service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'orange_cm',
          phone: '237650000000', // préfixe MTN (650)
        },
        CONTEXT,
      );

      // Aucun appel natif ni aucune écriture : rejet prouvé pré-charge.
      expect(orangeCmService.getAccessToken).not.toHaveBeenCalled();
      expect(orangeCmService.initPay).not.toHaveBeenCalled();
      expect(gateway.createDirectPayin).not.toHaveBeenCalled();
      expect(gateway.createPayin).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ redirect_url: 'https://pay' });
    });

    it('replie en hébergé un numéro Orange saisi sur une passerelle mtn_cm', async () => {
      const { service, gateway, mtnCmService } = build({
        NATIVE_PAYIN_ENABLED: 'true',
      });
      gateway.createPayin.mockResolvedValue({ redirect_url: 'https://pay' });

      const result = await service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'mtn_cm',
          phone: '237691224472',
        },
        CONTEXT,
      );

      expect(mtnCmService.requestToPay).not.toHaveBeenCalled();
      expect(gateway.createPayin).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ redirect_url: 'https://pay' });
    });

    it('replie en hébergé un numéro non camerounais sur une passerelle native', async () => {
      const { service, gateway } = build({ NATIVE_PAYIN_ENABLED: 'true' });
      gateway.createPayin.mockResolvedValue({ redirect_url: 'https://pay' });

      const result = await service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'orange_cm',
          phone: '221771234567', // Sénégal (XOF)
          country: 'SN',
        },
        CONTEXT,
      );

      expect(result).toMatchObject({ redirect_url: 'https://pay' });
      expect(gateway.createDirectPayin).not.toHaveBeenCalled();
    });

    it('ne replie JAMAIS sur une erreur ambiguë native (5xx après /pay)', async () => {
      const { service, gateway, orangeCmService } = build({
        NATIVE_PAYIN_ENABLED: 'true',
      });
      const ambiguous = new HttpException({ message: 'upstream' }, 502);
      orangeCmService.pay.mockRejectedValue(ambiguous);

      await expect(
        service.resolve(
          TRANSACTION,
          {
            method: 'mobile_money',
            gatewayType: 'orange_cm',
            phone: '237691224472',
          },
          CONTEXT,
        ),
      ).rejects.toBe(ambiguous);

      // Le payin reste `pending` (payToken persisté) : le cron natif réconcilie.
      expect(gateway.createPayin).not.toHaveBeenCalled();
    });
  });

  describe('échec natif pré-charge (token / init) → checkout hébergé', () => {
    it('ouvre un checkout hébergé quand le token Orange échoue, sur la MÊME transaction', async () => {
      const { service, gateway, orangeCmService, payinService } = build({
        NATIVE_PAYIN_ENABLED: 'true',
      });
      orangeCmService.getAccessToken.mockRejectedValue(
        new HttpException({ message: 'Orange CM token request failed' }, 502),
      );

      const result = await service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'orange_cm',
          phone: '237691224472',
        },
        CONTEXT,
      );

      // Aucun `/pay` n'a été tenté : rien n'est en vol.
      expect(orangeCmService.initPay).not.toHaveBeenCalled();
      expect(orangeCmService.pay).not.toHaveBeenCalled();

      // Le payin natif est clôturé AVANT d'ouvrir l'autre voie.
      expect(payinService.markChargeTerminal).toHaveBeenCalledWith(
        'txNative-1',
        'tx-1',
        'failed',
        expect.anything(),
      );

      // Le repli réutilise la transaction existante (pas de doublon).
      expect(gateway.createHostedPayinForTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({ _id: 'tx-1' }),
          currency: 'XAF',
        }),
      );

      expect(result).toMatchObject({
        chargeStatus: 'fallback_hosted',
        redirect_url: expect.stringContaining('checkout.flutterwave.com'),
        fallback: {
          from: 'native_cm',
          reason: 'NATIVE_PRE_CHARGE_FAILED',
          directTxRef: 'txNative-1',
        },
      });
      // Le chemin hébergé historique (nouvelle transaction) n'est PAS utilisé.
      expect(gateway.createPayin).not.toHaveBeenCalled();
    });

    it('replie aussi quand `mp/init` échoue', async () => {
      const { service, gateway, orangeCmService } = build({
        NATIVE_PAYIN_ENABLED: 'true',
      });
      orangeCmService.initPay.mockRejectedValue(
        new HttpException({ message: 'init failed' }, 502),
      );

      const result = await service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'orange_cm',
          phone: '237691224472',
        },
        CONTEXT,
      );

      expect(orangeCmService.pay).not.toHaveBeenCalled();
      expect(gateway.createHostedPayinForTransaction).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ chargeStatus: 'fallback_hosted' });
    });

    it('respecte le drapeau de repli désactivé et remonte le rejet pré-charge', async () => {
      const { service, gateway, orangeCmService } = build({
        NATIVE_PAYIN_ENABLED: 'true',
        DIRECT_CHARGE_FALLBACK_HOSTED: 'false',
      });
      orangeCmService.getAccessToken.mockRejectedValue(
        new HttpException({ message: 'token down' }, 502),
      );

      const error = await service
        .resolve(
          TRANSACTION,
          {
            method: 'mobile_money',
            gatewayType: 'orange_cm',
            phone: '237691224472',
          },
          CONTEXT,
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'NATIVE_PRE_CHARGE_FAILED',
      });

      expect(gateway.createHostedPayinForTransaction).not.toHaveBeenCalled();
    });

    it('remonte NATIVE_FALLBACK_FAILED si le checkout hébergé échoue aussi', async () => {
      const { service, gateway, orangeCmService } = build({
        NATIVE_PAYIN_ENABLED: 'true',
      });
      orangeCmService.getAccessToken.mockRejectedValue(
        new HttpException({ message: 'token down' }, 502),
      );
      gateway.createHostedPayinForTransaction.mockRejectedValue(
        new HttpException({ message: 'hosted down' }, 502),
      );

      const error = await service
        .resolve(
          TRANSACTION,
          {
            method: 'mobile_money',
            gatewayType: 'orange_cm',
            phone: '237691224472',
          },
          CONTEXT,
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'NATIVE_FALLBACK_FAILED',
      });
    });
  });

  describe('idempotence d’une requête retentée (payin pending)', () => {
    it('ne re-débite JAMAIS un payin MTN pending déjà porteur d’un xReferenceId', async () => {
      // Premier appel : le payin est créé avec le xReferenceId généré.
      const { service, mtnCmService } = build({ NATIVE_PAYIN_ENABLED: 'true' });
      await service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'mtn_cm',
          phone: '237671224472',
        },
        CONTEXT,
      );
      expect(mtnCmService.requestToPay).toHaveBeenCalledTimes(1);

      // Requête retentée : createPendingPayin retourne le payin EXISTANT (qui
      // porte un autre xReferenceId) → retour `pending`, AUCUN second débit.
      const retried = build(
        { NATIVE_PAYIN_ENABLED: 'true' },
        {
          gatewayType: 'mtn_cm',
          pendingPayinMeta: {
            xReferenceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
        },
      );
      retried.mtnCmService.requestToPay.mockResolvedValue(undefined);

      const second = await retried.service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'mtn_cm',
          phone: '237671224472',
        },
        CONTEXT,
      );

      expect(retried.mtnCmService.requestToPay).not.toHaveBeenCalled();
      expect(second).toMatchObject({ chargeStatus: 'pending', provider: 'mtn_cm' });
    });

    it('ne re-débite JAMAIS un payin Orange pending déjà porteur d’un payToken', async () => {
      const retried = build(
        { NATIVE_PAYIN_ENABLED: 'true' },
        {
          gatewayType: 'orange_cm',
          pendingPayinMeta: { payToken: 'pay-token-prev' },
        },
      );

      const result = await retried.service.resolve(
        TRANSACTION,
        {
          method: 'mobile_money',
          gatewayType: 'orange_cm',
          phone: '237691224472',
        },
        CONTEXT,
      );

      expect(retried.orangeCmService.getAccessToken).not.toHaveBeenCalled();
      expect(retried.orangeCmService.initPay).not.toHaveBeenCalled();
      expect(retried.orangeCmService.pay).not.toHaveBeenCalled();
      expect(result).toMatchObject({ chargeStatus: 'pending' });
    });
  });
});
