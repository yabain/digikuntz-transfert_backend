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
}

interface Harness {
  service: PayinRouteService;
  gateway: GatewaySpy;
}

function build(env: Record<string, string> = {}): Harness {
  const gateway: GatewaySpy = {
    createPayin: jest.fn(),
    createDirectPayin: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => env[key]),
  };

  const service = new PayinRouteService(
    gateway as unknown as FlutterwaveService,
    configService as unknown as ConfigService,
  );

  return { service, gateway };
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
