/* eslint-disable prettier/prettier */
// src/transactions/schemas/transaction.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TransactionsDocument = Transactions & Document;

@Schema({ timestamps: true })
export class Transactions {
  @Prop({ required: true, unique: true })
  txRef: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  currency: string;

  @Prop()
  customerEmail: string;

  @Prop({ default: 'pending' }) // pending | success | failed | cancelled
  status: string;

  @Prop()
  flwTxId?: number; // id from flutterwave

  @Prop({ type: Object })
  meta?: any;

  @Prop({ type: Object })
  raw?: any;
}

export const TransactionsSchema = SchemaFactory.createForClass(Transactions);
