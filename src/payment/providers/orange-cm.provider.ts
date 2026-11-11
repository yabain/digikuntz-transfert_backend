import { HttpException, HttpStatus } from '@nestjs/common';
import { PaymentGateway } from '../interfaces/payment-gateway.interface';
import { OrangeCmService } from 'src/orange-cm/orange-cm.service';

/**
 * Adaptateur « Orange CM » du contrat `PaymentGateway`.
 *
 * Seuls l'encaissement (`createPayin`/`verifyPayin`) et la vérification de
 * statut sont natifs. Le payout/disbursement, le solde et la liste de
 * transactions répondent 501 (comme M-Pesa) : Orange CM est un canal
 * d'**encaissement** dans ce chantier.
 */
export class OrangeCmProvider implements PaymentGateway {
  constructor(private readonly service: OrangeCmService) {}

  setCredentials(credentials: Record<string, any>): void {
    if (this.service.setCredentials) {
      this.service.setCredentials(credentials);
    }
  }

  getBalance(currency: string, countryWallet: string): Promise<any> {
    throw new HttpException(
      { message: 'getBalance not implemented for Orange CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  listPayinTransactions(countryWallet: string, query?: any): Promise<any> {
    throw new HttpException(
      { message: 'listPayinTransactions not implemented for Orange CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Encaissement natif Orange CM : token → `mp/init` → `mp/pay`.
   * Le `Payin` est créé par l'appelant (persist-then-charge) ; ce provider
   * retourne le statut courant + le `payToken` pour la réconciliation.
   */
  async createPayin(transactionData: any, userId: string): Promise<any> {
    const amount = Number(transactionData.estimation || transactionData.amount || 0);
    const msisdn = String(
      transactionData.senderContact ||
      transactionData.phone ||
      transactionData.meta?.msisdn ||
      '',
    ).replace(/\s+/g, '');
    if (!msisdn || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { message: 'Orange CM createPayin requires estimation/amount and senderContact' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const token = await this.service.getAccessToken();
    const { payToken } = await this.service.initPay(token);
    const notifUrl = String(transactionData.redirectUrl || '');
    await this.service.pay({
      payToken,
      subscriberMsisdn: msisdn,
      amount,
      orderId: transactionData.txRef || 'PAYMENT',
      description: transactionData.raisonForTransfer || 'Orange Money Cameroun',
      notifUrl,
    });
    return { status: 'pending', payToken, provider: 'orange_cm' };
  }

  verifyPayin(txRef: string, flwTxId?: string): Promise<any> {
    // Le `payToken` doit être fourni via `flwTxId` (utilisé par le réconciliateur).
    return this.service.getStatus(flwTxId || txRef);
  }

  processSuccessfulPayin(transaction: any, transactionId: string): Promise<any> {
    throw new HttpException(
      { message: 'processSuccessfulPayin not implemented for Orange CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  withdrawal(transactionData: any, userId: string): Promise<any> {
    throw new HttpException(
      { message: 'Withdrawal not implemented for Orange CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  payout(transactionId: string, userId: string, retrying?: boolean): Promise<any> {
    throw new HttpException(
      { message: 'payout not implemented for Orange CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  verifyPayout(reference: string, verifyPayout?: boolean, flwTxId?: string): Promise<any> {
    throw new HttpException(
      { message: 'verifyPayout not implemented for Orange CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  getBanksList(country: string): Promise<any> {
    throw new HttpException(
      { message: 'getBanksList not implemented for Orange CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  createTransferFromBalance(transactionData: any, userId: string): Promise<any> {
    throw new HttpException(
      { message: 'createTransferFromBalance not implemented for Orange CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  checkPayinStatus(transactionId: string, flwTxId?: string): Promise<any> {
    return this.service.getStatus(flwTxId || transactionId);
  }

  checkPayoutStatus(reference: string, flwTxId?: string): Promise<any> {
    throw new HttpException(
      { message: 'checkPayoutStatus not implemented for Orange CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}