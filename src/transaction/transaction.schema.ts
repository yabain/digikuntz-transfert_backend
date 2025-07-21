import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { TicketClasses } from 'src/ticket-classes/ticket-classes.shema';
import mongoose from 'mongoose';
import { User } from 'src/user/user.schema';
import { Event } from '../event/event.schema';
import { EventCategories } from 'src/event-categories/event-categories.schema';

export enum TransactionType {
  DEPOSITE = 'deposit',
  WITHDRAWAL = 'withdrawal',
  PAYMENT = 'payment',
}

export enum Currency {
  XAF = 'XAF',
  EU = 'EU',
  USD = 'USD',
}

export enum ReqStatus {
  PENDING = 'financial_transaction_pending',
  ERROR = 'financial_transaction_error',
  SUCCESS = 'financial_transaction_success',
}

export enum PaymentMethode {
  OM = 'ORANGE',
  MTN = 'MTN',
  PAYPAL = 'PAYPAL',
  VISA = 'VISA',
}

export class TicketClassIdrate {
  @Prop()
  price: number;

  @Prop()
  quantity: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'TicketClasses' })
  ticketClassId: TicketClasses;
}

@Schema({
  timestamps: true,
})
export class Transaction {
  @Prop()
  invoiceRef: string;

  @Prop()
  payment: number;

  @Prop()
  paymentMethod: string;

  @Prop()
  paymentMethodNumber: string;

  @Prop()
  paymentWithTaxes: number; // as 'amount' in payment API req/res

  @Prop()
  reqStatus: ReqStatus; // as 'state' in payment API res

  @Prop()
  taxes: number;

  @Prop()
  taxesAmount: number;

  @Prop([{ type: Object }])
  tickets: TicketClassIdrate[];

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Event' })
  eventId: Event;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'EventCategories' })
  categoryId: EventCategories;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop()
  userEmail: string;

  @Prop()
  userName: string;

  @Prop()
  userPhone: string;

  @Prop()
  type: TransactionType;

  @Prop()
  moneyCode: Currency; // as 'moneyCode' in payment API req/res

  @Prop()
  titled: string; // as 'raison' in payment API req/res

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
