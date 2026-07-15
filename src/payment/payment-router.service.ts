import { Injectable, Logger } from '@nestjs/common';
import { GatewayFactoryService } from './gateway-factory.service';

export type PaymentProvider = 'flutterwave' | 'paystack' | 'mpesa';

@Injectable()
export class PaymentRouterService {
  private readonly logger = new Logger(PaymentRouterService.name);

  constructor(
    private readonly gatewayFactory: GatewayFactoryService,
  ) {}

  private async resolve(currency: string) {
    return this.gatewayFactory.forCurrency(currency);
  }

  async getBalance(currency: string, countryWallet: string): Promise<any> {
    return (await this.resolve(currency)).getBalance(currency, countryWallet);
  }

  async listPayinTransactions(countryWallet: string, query?: any): Promise<any> {
    const currency = this.countryToCurrency(countryWallet);
    return (await this.resolve(currency)).listPayinTransactions(countryWallet, query);
  }

  async createPayin(transactionData: any, userId: string): Promise<any> {
    const currency = transactionData?.currency || transactionData?.senderCurrency || 'XAF';
    return (await this.resolve(currency)).createPayin(transactionData, userId);
  }

  async verifyPayin(txRef: string, flwTxId?: string): Promise<any> {
    return (await this.resolve('XAF')).verifyPayin(txRef, flwTxId);
  }

  async processSuccessfulPayin(transaction: any, transactionId: string): Promise<any> {
    const currency = transaction?.senderCurrency || 'XAF';
    return (await this.resolve(currency)).processSuccessfulPayin(transaction, transactionId);
  }

  async withdrawal(transactionData: any, userId: string): Promise<any> {
    const currency = transactionData?.currency || transactionData?.senderCurrency || 'XAF';
    return (await this.resolve(currency)).withdrawal(transactionData, userId);
  }

  async payout(transactionId: string, userId: string, retrying?: boolean, currency?: string): Promise<any> {
    return (await this.resolve(currency || 'XAF')).payout(transactionId, userId, retrying);
  }

  async verifyPayout(reference: string, verifyPayout?: boolean, flwTxId?: string): Promise<any> {
    return (await this.resolve('XAF')).verifyPayout(reference, verifyPayout, flwTxId);
  }

  async getBanksList(country: string): Promise<any> {
    return (await this.resolve('XAF')).getBanksList(country);
  }

  async createTransferFromBalance(transactionData: any, userId: string): Promise<any> {
    const currency = transactionData?.currency || transactionData?.senderCurrency || 'XAF';
    return (await this.resolve(currency)).createTransferFromBalance(transactionData, userId);
  }

  checkPayinStatusOnFlutterwave(txRef: string, flwTxId?: string): Promise<any> {
    return this.resolve('XAF').then(p => p.checkPayinStatus(txRef, flwTxId));
  }

  checkPayoutStatusOnFlutterwave(reference: string, flwTxId?: string): Promise<any> {
    return this.resolve('XAF').then(p => p.checkPayoutStatus(reference, flwTxId));
  }

  private countryToCurrency(countryWallet: string): string {
    const map: Record<string, string> = {
      CM: 'XAF',
      NG: 'NGN',
      KE: 'KES',
    };
    return map[countryWallet?.toUpperCase()] || 'XAF';
  }
}
