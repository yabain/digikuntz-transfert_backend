/**
 * Tests de l'assainissement du taux de frais des endpoints à body non typé.
 *
 * `PaymentMethodService.resolveTaxOverride` est la seule barrière qui empêche un
 * payeur de forcer ses frais : les endpoints (`/fw/payin`,
 * `/fw/transfer-from-balance`, dons) reçoivent un `@Body() any` répandu dans
 * `transactionData`. Ces tests vérifient donc trois propriétés monétaires :
 *
 * 1. Un taux fourni par le client (`taxRateOverride`/`invoiceTaxes`) est TOUJOURS
 *    supprimé et remplacé par le taux serveur.
 * 2. Un encaissement prend `taxesPayment`, un transfert `taxesTransfer`.
 * 3. Une méthode non éligible (devise, sens) est refusée, pas facturée.
 */
import { BadRequestException } from '@nestjs/common';
import { PaymentMethodService } from './payment-method.service';

function buildFinder(method: any) {
  const service = new PaymentMethodService({} as any);
  jest.spyOn(service, 'findByCode').mockResolvedValue(method);
  return service;
}

const XAF_METHOD = {
  code: 'MOMO',
  currency: 'XAF',
  statusPayin: true,
  statusPayout: true,
  taxesPayment: 2,
  taxesTransfer: 1,
};

describe('PaymentMethodService.resolveTaxOverride', () => {
  it('supprime un taux imposé par le client (payin)', async () => {
    const service = buildFinder(XAF_METHOD);

    const data = await service.resolveTaxOverride(
      {
        currency: 'XAF',
        paymentMethod: 'MOMO',
        estimation: 1000,
        taxRateOverride: 0,
        invoiceTaxes: 0,
      },
      'payin',
    );

    expect(data.taxRateOverride).toBe(2);
    expect(data.invoiceTaxes).toBeUndefined();
  });

  it('utilise taxesPayment pour un encaissement', async () => {
    const service = buildFinder(XAF_METHOD);
    const data = await service.resolveTaxOverride(
      { currency: 'XAF', paymentMethod: 'MOMO' },
      'payin',
    );
    expect(data.taxRateOverride).toBe(2);
  });

  it('utilise taxesTransfer pour un transfert', async () => {
    const service = buildFinder(XAF_METHOD);
    const data = await service.resolveTaxOverride(
      { currency: 'XAF', paymentMethod: 'MOMO' },
      'payout',
    );
    expect(data.taxRateOverride).toBe(1);
  });

  it('détecte un transfert via transactionType sur un endpoint payin', async () => {
    const service = buildFinder(XAF_METHOD);
    const data = await service.resolveTaxOverride(
      { currency: 'XAF', paymentMethod: 'MOMO', transactionType: 'transfer' },
      'payin',
    );
    expect(data.taxRateOverride).toBe(1);
  });

  it('ne pose aucun taux si aucune méthode ne correspond', async () => {
    const service = buildFinder(null);
    const data = await service.resolveTaxOverride(
      { currency: 'XAF', paymentMethod: 'UNKNOWN', taxRateOverride: 99 },
      'payin',
    );
    expect(data.taxRateOverride).toBeUndefined();
  });

  it('refuse une méthode d’une autre devise', async () => {
    const service = buildFinder(XAF_METHOD);
    await expect(
      service.resolveTaxOverride({ currency: 'NGN', paymentMethod: 'MOMO' }, 'payin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une méthode désactivée pour le sens demandé', async () => {
    const service = buildFinder({ ...XAF_METHOD, statusPayin: false });
    await expect(
      service.resolveTaxOverride({ currency: 'XAF', paymentMethod: 'MOMO' }, 'payin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('méthode PAYEUR d’un transfert', () => {
    const RECEIVER_METHOD = {
      code: 'MOMO',
      currency: 'XAF',
      statusPayin: true,
      statusPayout: true,
      taxesPayment: 2,
      taxesTransfer: 1,
    };
    const CARD_METHOD = {
      code: 'CARD',
      currency: 'XAF',
      statusPayin: true,
      // Une carte encaisse mais ne reçoit pas : le payout ne doit pas la valider.
      statusPayout: false,
      taxesPayment: 4,
      taxesTransfer: 3,
    };

    function buildFinderByCode(methods: Record<string, any>) {
      const service = new PaymentMethodService({} as any);
      jest
        .spyOn(service, 'findByCode')
        .mockImplementation(async (code: string) => methods[code] ?? null);
      return service;
    }

    it('utilise le taxesTransfer de la méthode payeur, même sans statusPayout', async () => {
      const service = buildFinderByCode({ CARD: CARD_METHOD, MOMO: RECEIVER_METHOD });

      const data = await service.resolveTaxOverride(
        {
          currency: 'XAF',
          transactionType: 'transfer',
          payerPaymentMethodCode: 'CARD',
          // Méthode de réception : ne doit PAS porter le taux.
          paymentMethod: 'MOMO',
        },
        'payin',
      );

      expect(data.taxRateOverride).toBe(3);
    });

    it('privilégie la méthode payeur sur la méthode de réception', async () => {
      const service = buildFinderByCode({ CARD: CARD_METHOD, MOMO: RECEIVER_METHOD });

      const data = await service.resolveTaxOverride(
        {
          currency: 'XAF',
          transactionType: 'transfer',
          payerPaymentMethodCode: 'CARD',
          paymentMethodCode: 'MOMO',
        },
        'payin',
      );

      expect(data.taxRateOverride).toBe(CARD_METHOD.taxesTransfer);
    });

    it('refuse une méthode payeur non ouverte au payin', async () => {
      const service = buildFinderByCode({
        CARD: { ...CARD_METHOD, statusPayin: false },
      });

      await expect(
        service.resolveTaxOverride(
          {
            currency: 'XAF',
            transactionType: 'transfer',
            payerPaymentMethodCode: 'CARD',
          },
          'payin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse une méthode payeur inconnue au lieu d’appliquer le taux système', async () => {
      const service = buildFinderByCode({});

      await expect(
        service.resolveTaxOverride(
          {
            currency: 'XAF',
            transactionType: 'transfer',
            payerPaymentMethodCode: 'GHOST',
          },
          'payin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse un montant hors bornes de la méthode payeur', async () => {
      const service = buildFinderByCode({
        CARD: { ...CARD_METHOD, minAmount: 1000, maxAmount: 5000 },
      });

      await expect(
        service.resolveTaxOverride(
          {
            currency: 'XAF',
            transactionType: 'transfer',
            payerPaymentMethodCode: 'CARD',
            estimation: 500,
          },
          'payin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

describe('PaymentMethodService bornes de montant', () => {
  const OBJECT_ID = '507f1f77bcf86cd799439011';

  function buildService() {
    const model: any = {
      create: jest.fn((dto: any) => Promise.resolve({ _id: 'pm-1', ...dto })),
      findByIdAndUpdate: jest.fn(() => ({
        populate: jest.fn().mockResolvedValue({ _id: OBJECT_ID }),
      })),
    };
    return { model, service: new PaymentMethodService(model) };
  }

  it('accepte un minimum sans maximum (0 = pas de limite)', async () => {
    const { service } = buildService();

    await expect(
      service.create({
        name: 'Orange Money XAF',
        code: 'ORANGEMONEY',
        type: 'mobile',
        currency: 'XAF',
        minAmount: 1000,
        maxAmount: 0,
      } as any),
    ).resolves.toBeDefined();
  });

  it('refuse un minimum supérieur au maximum quand les deux sont définis', async () => {
    const { service } = buildService();

    await expect(
      service.create({
        name: 'Orange Money XAF',
        code: 'ORANGEMONEY',
        type: 'mobile',
        currency: 'XAF',
        minAmount: 2000,
        maxAmount: 1000,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte un minimum sans maximum à la mise à jour', async () => {
    const { service } = buildService();

    await expect(
      service.update(OBJECT_ID, {
        minAmount: 1000,
        maxAmount: 0,
      } as any),
    ).resolves.toBeDefined();
  });
});
