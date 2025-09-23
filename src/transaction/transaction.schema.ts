import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { User } from 'src/user/user.schema';

export enum TransactionType {
  DEPOSITE = 'deposit',
  WITHDRAWAL = 'withdrawal',
  PAYMENT = 'payment',
  TRANSFER = 'transfer',
  SUBSCRIPTION = 'subscription',
  FUNDRAISING = 'fundraising',
}

export enum Currency {
  XAF = 'XAF',
  EU = 'EU',
  USD = 'USD',
}

export enum TStatus {
  INITIALIZED = 'transaction_initialized',

  PAYINPENDING = 'transaction_payin_pending',
  PAYINSUCCESS = 'transaction_payin_success',
  PAYINERROR = 'transaction_payin_error',
  PAYINCLOSED = 'transaction_payin_closed',

  PAYOUTPENDING = 'transaction_payout_pending',
  PAYOUTSUCCESS = 'transaction_payout_success',
  PAYOUTERROR = 'transaction_payout_error',
  PAYOUTCLOSED = 'transaction_payout_closed',
  PAYOUTREJECTED = 'transaction_payout_rejected',

  ERROR = 'transaction_error',
  SUCCESS = 'transaction_success',
}

export enum PaymentMethode {
  OM = 'ORANGEMONEY',
  MTN = 'MTN',
  PAYPAL = 'PAYPAL',
  VISA = 'VISA',
  BANK = 'BANK',
}

@Schema({
  timestamps: true,
})
export class Transaction {
  @Prop()
  bankAccountNumber: string;

  @Prop()
  bankCode: string;

  @Prop()
  estimation: string;

  @Prop()
  transactionRef: string;

  @Prop()
  invoiceTaxes: string;

  @Prop()
  paymentMethod: string;

  @Prop()
  paymentStatus: string;

  @Prop()
  paymentWithTaxes: string;

  @Prop()
  raisonForTransfer: string;

  @Prop()
  receiverAddress: string;

  @Prop()
  receiverAmount: string;

  @Prop()
  receiverAccountType: string;

  @Prop()
  receiverContact: string;

  @Prop()
  receiverCountry: string;

  @Prop()
  receiverCurrency: string;

  @Prop()
  receiverEmail: string;

  @Prop()
  receiverMobileAccountNumber: string;

  @Prop()
  receiverName: string;

  @Prop()
  senderContact: string;

  @Prop()
  senderCountry: string;

  @Prop()
  senderCurrency: string;

  @Prop()
  senderEmail: string;

  @Prop()
  senderId: string;

  @Prop()
  senderName: string;

  @Prop()
  taxesAmount: string;

  @Prop()
  payment: number;

  @Prop()
  status: TStatus; // as 'state' in payment API res

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop()
  transactionType: TransactionType;

  @Prop()
  paymentMode: PaymentMethode; // In payment API req/res

  @Prop()
  token: string; // In payment API res

  @Prop()
  ref: string; // In payment API res

  @Prop()
  reqStatusCode: number; // statusCode in payment API res

  @Prop()
  reqErrorCode: number; // data.error in payment API res

  @Prop()
  message: string; // Deduced from the response code
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
