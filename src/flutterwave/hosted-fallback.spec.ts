/**
 * Repli vers le checkout hébergé après un REFUS EXPLICITE de la charge directe.
 *
 * Ce comportement est demandé pour les opérateurs que Flutterwave refuse en
 * direct (ex. Orange Money) : au lieu de renvoyer une erreur nue, le système
 * ouvre immédiatement un checkout hébergé et renvoie son `redirect_url`.
 *
 * Le garde-fou monétaire est le cœur de ces tests :
 *  - un refus explicite (4xx / enveloppe `failed`) ⇒ repli autorisé ;
 *  - une erreur ambiguë (5xx, timeout, réseau) ⇒ AUCUN repli, car la charge a
 *    peut-être abouti (double débit).
 */
import { HttpException } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { PayinStatus } from 'src/payin/payin.schema';

type ServiceArgs = ConstructorParameters<typeof FlutterwaveService>;

/** Index des collaborateurs dans le constructeur (cf. `flutterwave.service.ts`). */
const API = 1;
const PAYIN = 4;
const TRANSACTION = 6;
const GATEWAY_MODEL = 14;
const CRYPT = 15;
const CONFIG = 17;
const MPESA = 19;

function build(env: Record<string, string> = {}) {
  const payin = {
    generateTxRef: jest.fn((prefix = 'tx') => `${prefix}-1`),
    createPendingPayin: jest.fn(async () => ({ txRef: 'txDirect-1' })),
    attachChargeResult: jest.fn(async () => ({ txRef: 'txDirect-1' })),
    markChargeTerminal: jest.fn(async () => ({ txRef: 'txDirect-1' })),
    verifyPayin: jest.fn(),
    getPayinByTransactionId: jest.fn(),
    updatePayinStatus: jest.fn(async () => undefined),
    setCredentials: jest.fn(),
    createPayin: jest.fn(async (dto: any) => ({
      status: 'pending',
      transactionId: dto.transactionId,
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      redirect_url: 'https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-test',
    })),
  };

  const api = {
    hasCredentials: jest.fn(async () => true),
    chargeMobileMoney: jest.fn(),
  };

  const transaction = {
    createTransaction: jest.fn(async () => ({
      _id: 'tx-1',
      estimation: '1000',
      invoiceTaxes: '50',
      taxesAmount: '50',
      paymentWithTaxes: '1050',
      senderCurrency: 'XAF',
      senderEmail: 'payer@example.com',
      senderName: 'Payer',
      senderContact: '237691224472',
    })),
    updateTransactionFlwTxId: jest.fn(async () => undefined),
    markPayinModeHosted: jest.fn(async () => undefined),
    findById: jest.fn(async () => ({
      _id: 'tx-1',
      status: 'transaction_payin_pending',
      transactionType: 'apiCall',
    })),
    updateTransactionStatus: jest.fn(async () => undefined),
  };

  const gatewayModel = {
    findOne: jest.fn(() => ({
      exec: async () => ({ type: 'flutterwave', credentials: 'encrypted' }),
    })),
    findById: jest.fn(() => ({
      exec: async () => ({ type: 'flutterwave', credentials: 'encrypted' }),
    })),
  };
  const crypt = {
    decryptWithPassphrase: jest.fn(() =>
      JSON.stringify({ secretKey: 'sk_test' }),
    ),
  };
  const config = {
    get: jest.fn((key: string) => env[key]),
  };
  const mpesa = { setCredentials: jest.fn() };

  const args = new Array<unknown>(23).fill({});
  args[API] = api;
  args[PAYIN] = payin;
  args[TRANSACTION] = transaction;
  args[GATEWAY_MODEL] = gatewayModel;
  args[CRYPT] = crypt;
  args[CONFIG] = config;
  args[MPESA] = mpesa;

  return {
    service: new FlutterwaveService(...(args as unknown as ServiceArgs)),
    api,
    payin,
    transaction,
  };
}

const ENABLED = {
  DIRECT_CHARGE_ENABLED: 'true',
  DIRECT_CHARGE_FALLBACK_HOSTED: 'true',
};

const TRANSACTION_DATA = {
  estimation: 1000,
  senderCurrency: 'XAF',
  senderEmail: 'payer@example.com',
  senderId: 'user-1',
};

const CHARGE = {
  phone: '237691224472',
  email: 'payer@example.com',
  name: 'Payer',
  flow: 'transfer' as const,
};

async function capture(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to reject');
}

describe('FlutterwaveService — repli hébergé après refus direct', () => {
  it('ouvre un checkout hébergé sur la MÊME transaction et renvoie redirect_url', async () => {
    const { service, api, payin } = build(ENABLED);
    api.chargeMobileMoney.mockRejectedValue(
      new HttpException(
        {
          status: 'error',
          message: 'Account does not exist or Invalid Account',
        },
        400,
      ),
    );

    const result = await service.createDirectPayin(
      TRANSACTION_DATA,
      CHARGE,
    );

    // La tentative directe est clôturée, jamais laissée `pending`.
    expect(payin.markChargeTerminal).toHaveBeenCalledWith(
      'txDirect-1',
      'tx-1',
      PayinStatus.FAILED,
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Account does not exist or Invalid Account',
        }),
      }),
    );

    // Le checkout hébergé réutilise la transaction existante (pas de doublon).
    expect(payin.createPayin).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'tx-1',
        amount: 1050,
        currency: 'XAF',
        customerEmail: 'payer@example.com',
      }),
    );

    // La réponse contient l'URL ET le détail de l'erreur directe.
    expect(result).toMatchObject({
      chargeStatus: 'fallback_hosted',
      redirect_url:
        'https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-test',
      transactionId: 'tx-1',
      fallback: {
        from: 'direct',
        reason: 'DIRECT_CHARGE_REFUSED',
        directTxRef: 'txDirect-1',
      },
      directCharge: {
        message: 'Account does not exist or Invalid Account',
      },
    });
  });

  it('replie aussi sur une enveloppe 200 `data.status = failed`', async () => {
    const { service, api, payin } = build(ENABLED);
    api.chargeMobileMoney.mockResolvedValue({
      status: 'success',
      message: 'Transaction Failed',
      data: { id: 42, status: 'failed' },
    });

    const result = await service.createDirectPayin(
      TRANSACTION_DATA,
      CHARGE,
    );

    expect(payin.createPayin).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      chargeStatus: 'fallback_hosted',
      redirect_url: expect.stringContaining('checkout.flutterwave.com'),
      directCharge: { message: 'Transaction Failed' },
    });
  });

  it('consigne le repli sur la transaction (canal hébergé + trace)', async () => {
    const { service, api, transaction } = build(ENABLED);
    api.chargeMobileMoney.mockRejectedValue(
      new HttpException({ message: 'refused' }, 400),
    );

    await service.createDirectPayin(TRANSACTION_DATA, CHARGE);

    expect(transaction.markPayinModeHosted).toHaveBeenCalledTimes(1);
    expect(transaction.markPayinModeHosted).toHaveBeenCalledWith('tx-1', {
      from: 'direct',
      reason: 'DIRECT_CHARGE_REFUSED',
      directTxRef: expect.any(String),
    });
  });

  it('un payin remplacé (tentative directe échouée) ne fait PAS basculer la transaction', async () => {
    const { service, payin, transaction } = build(ENABLED);
    payin.verifyPayin.mockResolvedValue({
      txRef: 'txDirect-1',
      transactionId: 'tx-1',
      status: 'failed',
    });
    // Le payin courant est le checkout hébergé, encore en attente.
    payin.getPayinByTransactionId.mockResolvedValue({
      txRef: 'txPayin-2',
      status: 'pending',
    });

    const result = await service.verifyAndClosePayin('txDirect-1');

    expect(result).toMatchObject({ message: expect.stringContaining('Superseded') });
    expect(transaction.updateTransactionStatus).not.toHaveBeenCalled();
  });

  it('un payin courant échoué fait bien passer la transaction en erreur', async () => {
    const { service, payin, transaction } = build(ENABLED);
    payin.verifyPayin.mockResolvedValue({
      txRef: 'txPayin-2',
      transactionId: 'tx-1',
      status: 'failed',
      raw: { data: {} },
    });
    payin.getPayinByTransactionId.mockResolvedValue({
      txRef: 'txPayin-2',
      status: 'failed',
    });

    await service.verifyAndClosePayin('txPayin-2');

    expect(transaction.updateTransactionStatus).toHaveBeenCalledWith(
      'tx-1',
      'transaction_payin_error',
      expect.anything(),
    );
  });

  it('ne consigne PAS de repli sur une erreur ambiguë (5xx)', async () => {
    const { service, api, transaction } = build(ENABLED);
    api.chargeMobileMoney.mockRejectedValue(
      new HttpException({ message: 'upstream' }, 502),
    );

    await expect(
      service.createDirectPayin(TRANSACTION_DATA, CHARGE),
    ).rejects.toBeDefined();

    expect(transaction.markPayinModeHosted).not.toHaveBeenCalled();
  });

  it('ne replie JAMAIS sur une erreur ambiguë (5xx) et relance l’erreur', async () => {
    const { service, api, payin } = build(ENABLED);
    const ambiguous = new HttpException({ message: 'upstream' }, 502);
    api.chargeMobileMoney.mockRejectedValue(ambiguous);

    await expect(
      service.createDirectPayin(TRANSACTION_DATA, CHARGE),
    ).rejects.toBe(ambiguous);

    expect(payin.markChargeTerminal).not.toHaveBeenCalled();
    expect(payin.createPayin).not.toHaveBeenCalled();
  });

  it('ne replie JAMAIS sur un timeout réseau', async () => {
    const { service, api, payin } = build(ENABLED);
    api.chargeMobileMoney.mockRejectedValue(
      new Error('timeout of 30000ms exceeded'),
    );

    await expect(
      service.createDirectPayin(TRANSACTION_DATA, CHARGE),
    ).rejects.toThrow('timeout');

    expect(payin.createPayin).not.toHaveBeenCalled();
  });

  it('respecte le drapeau de repli désactivé', async () => {
    const { service, api, payin } = build({
      ...ENABLED,
      DIRECT_CHARGE_FALLBACK_HOSTED: 'false',
    });
    const refusal = new HttpException({ message: 'refused' }, 400);
    api.chargeMobileMoney.mockRejectedValue(refusal);

    await expect(
      service.createDirectPayin(TRANSACTION_DATA, CHARGE),
    ).rejects.toBe(refusal);

    expect(payin.createPayin).not.toHaveBeenCalled();
  });

  it('relance l’erreur directe si le checkout hébergé échoue aussi', async () => {
    const { service, api, payin } = build(ENABLED);
    const refusal = new HttpException({ message: 'refused' }, 400);
    api.chargeMobileMoney.mockRejectedValue(refusal);
    payin.createPayin.mockRejectedValue(
      new HttpException({ message: 'hosted down' }, 502),
    );

    await expect(
      service.createDirectPayin(TRANSACTION_DATA, CHARGE),
    ).rejects.toBe(refusal);

    // La tentative directe reste clôturée (`failed`) même si l'hébergé échoue.
    // On vérifie le résultat (statut terminal écrit), pas le nombre d'écritures :
    // la clôture est idempotente (filtre `status: PENDING`).
    expect(payin.markChargeTerminal).toHaveBeenCalled();
    const writes = payin.markChargeTerminal.mock.calls as unknown[][];
    for (const call of writes) {
      expect(call[2]).toBe('failed');
    }
  });

  it('ne clôt jamais un payin déjà terminal (webhook concurrent)', async () => {
    const { service, api, payin } = build(ENABLED);
    api.chargeMobileMoney.mockRejectedValue(
      new HttpException({ message: 'refused' }, 400),
    );
    payin.markChargeTerminal.mockResolvedValue(null as any);

    await service.createDirectPayin(TRANSACTION_DATA, CHARGE);

    // Le service continue le repli sans écraser un statut terminal.
    expect(payin.createPayin).toHaveBeenCalledTimes(1);
  });

  it('capture() reste utile pour les assertions négatives', async () => {
    // Garde-fou du harnais : une promesse qui résout ne doit pas être prise
    // pour un rejet.
    await expect(capture(async () => undefined)).rejects.toThrow(
      'Expected the call to reject',
    );
  });
});
