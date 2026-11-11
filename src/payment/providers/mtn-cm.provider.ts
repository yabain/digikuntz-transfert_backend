import { HttpException, HttpStatus } from '@nestjs/common';
import { PaymentGateway } from '../interfaces/payment-gateway.interface';
import { MtnCmService } from 'src/mtn-cm/mtn-cm.service';

/**
 * Adaptateur « MTN CM » du contrat `PaymentGateway`.
 *
 * Encaissement natif (`requesttopay` + statut) ; payout/disbursement, solde et
 * liste de transactions → 501 (comme M-Pesa) : MTN CM est un canal
 * d'**encaissement** dans ce chantier.
 */
export class MtnCmProvider implements PaymentGateway {
  constructor(private readonly service: MtnCmService) {}

  setCredentials(credentials: Record<string, any>): void {
    if (this.service.setCredentials) {
      this.service.setCredentials(credentials);
    }
  }

  getBalance(currency: string, countryWallet: string): Promise<any> {
    return this.service.getAccountBalance();
  }

  listPayinTransactions(countryWallet: string, query?: any): Promise<any> {
    throw new HttpException(
      { message: 'listPayinTransactions not implemented for MTN CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Encaissement natif MTN MoMo Cameroun : `requesttopay` (202 = requête de
   * débit partie). Le tmp `xReferenceId` UUID v4 est généré par le service et
   * renvoyé pour persistance/réconciliation.
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
        { message: 'MTN CM createPayin requires estimation/amount and senderContact' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const xReferenceId = this.service.newXReferenceId();
    const txRef = transactionData.txRef || 'PAYMENT';
    await this.service.requestToPay({
      partyId: msisdn,
      amount,
      currency: String(transactionData.currency || 'XAF').toUpperCase(),
      externalId: txRef,
      payerMessage: `Paiement de ${amount} ${transactionData.currency || 'XAF'}`,
      payeeNote: `Paiement de ${amount} ${transactionData.currency || 'XAF'}`,
      xReferenceId,
    });
    return { status: 'pending', xReferenceId, provider: 'mtn_cm' };
  }

  verifyPayin(txRef: string, flwTxId?: string): Promise<any> {
    // `flwTxId` porte le `xReferenceId` (utilisé par le réconciliateur).
    return this.service.getStatus(flwTxId || txRef);
  }

  processSuccessfulPayin(transaction: any, transactionId: string): Promise<any> {
    throw new HttpException(
      { message: 'processSuccessfulPayin not implemented for MTN CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  withdrawal(transactionData: any, userId: string): Promise<any> {
    throw new HttpException(
      { message: 'Withdrawal not implemented for MTN CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  payout(transactionId: string, userId: string, retrying?: boolean): Promise<any> {
    throw new HttpException(
      { message: 'payout not implemented for MTN CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  verifyPayout(reference: string, verifyPayout?: boolean, flwTxId?: string): Promise<any> {
    throw new HttpException(
      { message: 'verifyPayout not implemented for MTN CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  getBanksList(country: string): Promise<any> {
    throw new HttpException(
      { message: 'getBanksList not implemented for MTN CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  createTransferFromBalance(transactionData: any, userId: string): Promise<any> {
    throw new HttpException(
      { message: 'createTransferFromBalance not implemented for MTN CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  checkPayinStatus(transactionId: string, flwTxId?: string): Promise<any> {
    return this.service.getStatus(flwTxId || transactionId);
  }

  checkPayoutStatus(reference: string, flwTxId?: string): Promise<any> {
    throw new HttpException(
      { message: 'checkPayoutStatus not implemented for MTN CM' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}