/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Transaction } from '../transaction/transaction.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import { HydratedDocument } from 'mongoose';
import { User } from 'src/user/user.schema';

export type PayinDocument = HydratedDocument<Payin>;

export enum PayinStatus {
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Schema({
  timestamps: true,
})
export class Payin extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' })
  transactionId: Transaction;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop({ required: true })
  txRef: string; // your reference

  @Prop({ required: false })
  flwTxId?: string; // Flutterwave tx id

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  customerEmail: string;

  @Prop()
  customerName: string;

  @Prop({ default: 'PENDING' })
  status: PayinStatus;

  @Prop()
  channel: string;

  @Prop()
  redirectUrl?: string; // frontend success URL

  @Prop({ type: Object })
  raw?: any; // full payload for audit
}

export const PayinSchema = SchemaFactory.createForClass(Payin);
