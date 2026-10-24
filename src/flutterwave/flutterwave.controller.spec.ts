/**
 * Aiguillage du paiement d'un TRANSFERT à l'étape 3.
 *
 * Le payeur choisit une méthode d'encaissement (mobile money ou carte) :
 * - mobile money → charge directe via `PayinRouteService` (repli hébergé géré
 *   par ce service), avec le numéro saisi à l'étape 3 (validé contre
 *   l'opérateur de la méthode) ou, à défaut, celui du compte ;
 * - carte → checkout hébergé restreint aux cartes (`payinChannel: 'card'`) ;
 * - aucune méthode → comportement historique (checkout hébergé).
 *
 * Ces tests verrouillent le routage, la validation opérateur et le fait que le
 * champ historique `phone` du corps ne soit jamais utilisé pour débiter.
 */
import { BadRequestException } from '@nestjs/common';
import { FlutterwaveController } from './flutterwave.controller';

const MOBILE_METHOD = {
  code: 'MOMO',
  name: 'MTN Mobile Money XAF',
  currency: 'XAF',
  type: 'mobile',
  statusPayin: true,
  statusPayout: true,
  taxesPayment: 2,
  taxesTransfer: 1,
  countryId: { code: '237', iso2: 'CM' },
};

const CARD_METHOD = {
  code: 'CARD',
  currency: 'XAF',
  type: 'card',
  statusPayin: true,
  statusPayout: false,
  taxesPayment: 4,
  taxesTransfer: 3,
};

function buildController(overrides?: {
  methods?: Record<string, any>;
  user?: any;
}) {
  const fw = {
    createPayin: jest.fn().mockResolvedValue({ redirect_url: 'https://hosted.test' }),
  };
  const paymentMethodService = {
    resolveTaxOverride: jest.fn(async (body: any) => ({ ...body })),
    findByCode: jest.fn(async (code: string) => overrides?.methods?.[code] ?? null),
  };
  const payinRoute = {
    resolve: jest.fn().mockResolvedValue({ chargeStatus: 'pending', txRef: 'txDirect' }),
  };

  const controller = new FlutterwaveController(
    fw as any,
    paymentMethodService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    payinRoute as any,
  );

  const req = {
    user: overrides?.user ?? {
      _id: 'user-1',
      // Numéro MTN (préfixe 67) cohérent avec la méthode MOMO (MTN).
      phone: '237671224472',
      email: 'sender@example.com',
      firstName: 'John',
      lastName: 'Doe',
      countryId: { code: '237', iso2: 'CM' },
    },
    headers: {},
    ip: '127.0.0.1',
  };

  return { controller, fw, paymentMethodService, payinRoute, req };
}

const TRANSFER_BODY = {
  transactionType: 'transfer',
  senderCurrency: 'XAF',
  receiverCurrency: 'XAF',
  estimation: 1000,
  senderEmail: 'sender@example.com',
  payerPaymentMethodCode: 'MOMO',
  // Le numéro du corps ne doit jamais être utilisé pour débiter.
  phone: '237699999999',
};

describe('FlutterwaveController.createPayin — transfert', () => {
  it('route une méthode mobile vers PayinRoute avec le numéro du compte', async () => {
    const { controller, fw, payinRoute, req } = buildController({
      methods: { MOMO: MOBILE_METHOD },
    });

    await controller.createPayin({ ...TRANSFER_BODY }, req);

    expect(fw.createPayin).not.toHaveBeenCalled();
    expect(payinRoute.resolve).toHaveBeenCalledTimes(1);
    expect(payinRoute.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: 'transfer',
        payerPaymentMethodCode: 'MOMO',
      }),
      expect.objectContaining({
        method: 'mobile_money',
        phone: '237671224472',
        country: 'CM',
      }),
      expect.objectContaining({ flow: 'transfer' }),
    );
  });

  it('utilise le numéro saisi à l’étape 3 pour la charge directe', async () => {
    const { controller, payinRoute, req } = buildController({
      methods: {
        OM: {
          ...MOBILE_METHOD,
          code: 'OM',
          name: 'Orange Money XAF',
        },
      },
    });

    await controller.createPayin(
      {
        ...TRANSFER_BODY,
        payerPaymentMethodCode: 'OM',
        payerPhone: '237691224472',
      },
      req,
    );

    const [passedData, payer] = payinRoute.resolve.mock.calls[0];
    expect(payer).toEqual(
      expect.objectContaining({
        method: 'mobile_money',
        phone: '237691224472',
        country: 'CM',
      }),
    );
    // PII : le numéro ne doit pas être persisté avec la transaction.
    expect(passedData.payerPhone).toBeUndefined();
  });

  it('refuse un numéro d’un autre opérateur que la méthode choisie', async () => {
    const { controller, payinRoute, req } = buildController({
      methods: { MOMO: MOBILE_METHOD },
    });

    await expect(
      controller.createPayin(
        {
          ...TRANSFER_BODY,
          // MOMO = MTN, mais le numéro est Orange (69…).
          payerPhone: '237691224472',
        },
        req,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(payinRoute.resolve).not.toHaveBeenCalled();
  });

  it('refuse un numéro invalide avant toute écriture', async () => {
    const { controller, payinRoute, req } = buildController({
      methods: { MOMO: MOBILE_METHOD },
    });

    await expect(
      controller.createPayin(
        { ...TRANSFER_BODY, payerPhone: '123' },
        req,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(payinRoute.resolve).not.toHaveBeenCalled();
  });

  it('route une carte vers le checkout hébergé restreint aux cartes', async () => {
    const { controller, fw, payinRoute, req } = buildController({
      methods: { CARD: CARD_METHOD },
    });

    await controller.createPayin(
      { ...TRANSFER_BODY, payerPaymentMethodCode: 'CARD' },
      req,
    );

    expect(payinRoute.resolve).not.toHaveBeenCalled();
    expect(fw.createPayin).toHaveBeenCalledWith(
      expect.objectContaining({ payinChannel: 'card' }),
      'user-1',
    );
  });

  it('aligne la passerelle sur celle de la méthode, pas sur le corps client', async () => {
    const { controller, payinRoute, req } = buildController({
      methods: {
        MOMO: { ...MOBILE_METHOD, gatewayId: { _id: 'gw-method' } },
      },
    });

    await controller.createPayin(
      { ...TRANSFER_BODY, gatewayId: 'gw-client' },
      req,
    );

    expect(payinRoute.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ gatewayId: 'gw-method' }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('replie en hébergé si le compte n’a pas de numéro', async () => {
    const { controller, fw, payinRoute, req } = buildController({
      methods: { MOMO: MOBILE_METHOD },
      user: {
        _id: 'user-1',
        phone: '',
        email: 'sender@example.com',
        countryId: { code: '237', iso2: 'CM' },
      },
    });

    await controller.createPayin({ ...TRANSFER_BODY }, req);

    expect(payinRoute.resolve).not.toHaveBeenCalled();
    expect(fw.createPayin).toHaveBeenCalledTimes(1);
  });

  it('conserve le checkout hébergé historique sans méthode payeur', async () => {
    const { controller, fw, payinRoute, req } = buildController();

    await controller.createPayin(
      { transactionType: 'transfer', senderCurrency: 'XAF', estimation: 1000 },
      req,
    );

    expect(payinRoute.resolve).not.toHaveBeenCalled();
    expect(fw.createPayin).toHaveBeenCalledTimes(1);
  });

  it('ignore la méthode payeur hors transfert', async () => {
    const { controller, fw, payinRoute, req } = buildController({
      methods: { MOMO: MOBILE_METHOD },
    });

    await controller.createPayin(
      { transactionType: 'invoice', senderCurrency: 'XAF', estimation: 1000 },
      req,
    );

    expect(payinRoute.resolve).not.toHaveBeenCalled();
    expect(fw.createPayin).toHaveBeenCalledTimes(1);
  });

  it('refuse une méthode payeur désactivée', async () => {
    const { controller, req } = buildController({
      methods: { MOMO: { ...MOBILE_METHOD, statusPayin: false } },
    });

    await expect(
      controller.createPayin({ ...TRANSFER_BODY }, req),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
