import { PaymentGateway } from '../interfaces/payment-gateway.interface';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';

export class FlutterwaveProvider implements PaymentGateway {
  constructor(private readonly service: FlutterwaveService) {}

  setCredentials(credentials: Record<string, any>): void {
    this.service.setCredentials(credentials);
  }

  getBalance(currency: string, countryWallet: string): Promise<any> {
    return this.service.getBalance(countryWallet);
  }

  listPayinTransactions(countryWallet: string, query?: any): Promise<any> {
    return this.service.listPayinTransactions(countryWallet, query);
  }

  createPayin(transactionData: any, userId: string): Promise<any> {
    return this.service.createPayin(transactionData, userId);
  }

  verifyPayin(txRef: string, flwTxId?: string): Promise<any> {
    return this.service.verifyPayin(txRef, flwTxId);
  }

  processSuccessfulPayin(transaction: any, transactionId: string): Promise<any> {
    return this.service.processSuccessfulPayin(transaction, transactionId);
  }

  withdrawal(transactionData: any, userId: string): Promise<any> {
    return this.service.withdrawal(transactionData, userId);
  }

  payout(transactionId: string, userId: string, retrying?: boolean): Promise<any> {
    return this.service.payout(transactionId, userId, retrying);
  }

  verifyPayout(reference: string, verifyPayout?: boolean, flwTxId?: string): Promise<any> {
    return this.service.verifyPayout(reference, verifyPayout, flwTxId);
  }

  getBanksList(country: string): Promise<any> {
    return this.service.getBanksList(country);
  }

  createTransferFromBalance(transactionData: any, userId: string): Promise<any> {
    return this.service.createTransferFromBalance(transactionData, userId);
  }

  checkPayinStatus(transactionId: string, flwTxId?: string): Promise<any> {
    return this.service.checkPayinStatusOnFlutterwave(transactionId, flwTxId);
  }

  checkPayoutStatus(reference: string, flwTxId?: string): Promise<any> {
    return this.service.checkPayoutStatusOnFlutterwave(reference, flwTxId);
  }
}
