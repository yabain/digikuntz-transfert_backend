/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Transaction } from '../transaction/transaction.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';

export type PayinDocument = Payin & Document;

@Schema({
  timestamps: true,
})
export class Payin extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' })
  transactionId: Transaction;

  @Prop({ required: true, unique: true })
  txRef: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  currency: string;

  @Prop()
  customerEmail: string;

  @Prop({ default: 'transaction_pending' })
  status: string;

  @Prop()
  flwTxId?: number; // id from flutterwave

  @Prop({ type: Object })
  meta?: any;

  @Prop({ type: Object })
  raw?: any;
}

export const PayinSchema = SchemaFactory.createForClass(Payin);
