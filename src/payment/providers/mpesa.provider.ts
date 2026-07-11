import { HttpException, HttpStatus } from '@nestjs/common';
import { PaymentGateway } from '../interfaces/payment-gateway.interface';
import { MpesaService } from 'src/mpesa/mpesa.service';

export class MpesaProvider implements PaymentGateway {
  constructor(private readonly service: MpesaService) {}

  setCredentials(credentials: Record<string, any>): void {
    if (this.service.setCredentials) {
      this.service.setCredentials(credentials);
    }
  }

  getBalance(currency: string, countryWallet: string): Promise<any> {
    return this.service.queryAccountBalance();
  }

  listPayinTransactions(countryWallet: string, query?: any): Promise<any> {
    throw new HttpException(
      { message: 'listPayinTransactions not implemented for M-Pesa' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  createPayin(transactionData: any, userId: string): Promise<any> {
    return this.service.initiateStkPush({
      phone: transactionData.senderContact,
      amount: transactionData.estimation || transactionData.amount,
      reference: transactionData.txRef || 'PAYMENT',
      description: transactionData.raisonForTransfer || 'Payment',
    });
  }

  verifyPayin(txRef: string, flwTxId?: string): Promise<any> {
    return this.service.queryStkStatus(txRef);
  }

  processSuccessfulPayin(transaction: any, transactionId: string): Promise<any> {
    throw new HttpException(
      { message: 'processSuccessfulPayin not implemented for M-Pesa' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  withdrawal(transactionData: any, userId: string): Promise<any> {
    throw new HttpException(
      { message: 'Withdrawal not implemented for M-Pesa' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  payout(transactionId: string, userId: string, retrying?: boolean): Promise<any> {
    return this.service.initiateB2CPayout({ transactionId } as any);
  }

  verifyPayout(reference: string, verifyPayout?: boolean, flwTxId?: string): Promise<any> {
    throw new HttpException(
      { message: 'verifyPayout not implemented for M-Pesa' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  getBanksList(country: string): Promise<any> {
    throw new HttpException(
      { message: 'getBanksList not implemented for M-Pesa' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  createTransferFromBalance(transactionData: any, userId: string): Promise<any> {
    throw new HttpException(
      { message: 'createTransferFromBalance not implemented for M-Pesa' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  checkPayinStatus(transactionId: string, flwTxId?: string): Promise<any> {
    return this.service.queryStkStatus(transactionId);
  }

  checkPayoutStatus(reference: string, flwTxId?: string): Promise<any> {
    throw new HttpException(
      { message: 'checkPayoutStatus not implemented for M-Pesa' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
