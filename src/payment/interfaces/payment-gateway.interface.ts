export interface PaymentGateway {
  getBalance(currency: string, countryWallet: string): Promise<any>;
  listPayinTransactions(countryWallet: string, query?: any): Promise<any>;
  createPayin(transactionData: any, userId: string): Promise<any>;
  verifyPayin(txRef: string, flwTxId?: string): Promise<any>;
  processSuccessfulPayin(transaction: any, transactionId: string): Promise<any>;
  withdrawal(transactionData: any, userId: string): Promise<any>;
  payout(transactionId: string, userId: string, retrying?: boolean): Promise<any>;
  verifyPayout(reference: string, verifyPayout?: boolean, flwTxId?: string): Promise<any>;
  getBanksList(country: string): Promise<any>;
  createTransferFromBalance(transactionData: any, userId: string): Promise<any>;
  checkPayinStatus(transactionId: string, flwTxId?: string): Promise<any>;
  checkPayoutStatus(reference: string, flwTxId?: string): Promise<any>;
  setCredentials(credentials: Record<string, any>): void;
}
