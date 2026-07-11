import { HttpException, HttpStatus } from '@nestjs/common';
import { PaymentGateway } from '../interfaces/payment-gateway.interface';
import { PaystackService } from 'src/paystack/paystack.service';

export class PaystackProvider implements PaymentGateway {
  constructor(private readonly service: PaystackService) {}

  setCredentials(credentials: Record<string, any>): void {
    if (this.service.setCredentials) {
      this.service.setCredentials(credentials);
    }
  }

  getBalance(currency: string, countryWallet: string): Promise<any> {
    return this.service.getBalance();
  }

  listPayinTransactions(countryWallet: string, query?: any): Promise<any> {
    return this.service.listPayinTransactions(query);
  }

  createPayin(transactionData: any, userId: string): Promise<any> {
    return this.service.initializeKesMpesaPayment({
      email: transactionData.senderEmail,
      amountKobo: Math.round(Number(transactionData.estimation || transactionData.amount) * 100),
      reference: transactionData.txRef,
      callbackUrl: transactionData.redirectUrl,
      metadata: { userId, transactionData },
    });
  }

  verifyPayin(txRef: string, flwTxId?: string): Promise<any> {
    return this.service.verifyTransaction(txRef);
  }

  processSuccessfulPayin(transaction: any, transactionId: string): Promise<any> {
    throw new HttpException(
      { message: 'processSuccessfulPayin not implemented for Paystack' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  withdrawal(transactionData: any, userId: string): Promise<any> {
    throw new HttpException(
      { message: 'Withdrawal not implemented for Paystack' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  payout(transactionId: string, userId: string, retrying?: boolean): Promise<any> {
    return this.service.initiateKesPayout({ transactionId } as any);
  }

  verifyPayout(reference: string, verifyPayout?: boolean, flwTxId?: string): Promise<any> {
    return this.service.fetchTransferByReference(reference);
  }

  getBanksList(country: string): Promise<any> {
    throw new HttpException(
      { message: 'getBanksList not implemented for Paystack' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  createTransferFromBalance(transactionData: any, userId: string): Promise<any> {
    throw new HttpException(
      { message: 'createTransferFromBalance not implemented for Paystack' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  checkPayinStatus(transactionId: string, flwTxId?: string): Promise<any> {
    return this.service.verifyTransaction(transactionId);
  }

  checkPayoutStatus(reference: string, flwTxId?: string): Promise<any> {
    return this.service.fetchTransferByReference(reference);
  }
}
