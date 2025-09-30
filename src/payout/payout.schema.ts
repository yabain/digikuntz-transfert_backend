/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Transaction } from '../transaction/transaction.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import { HydratedDocument } from 'mongoose';
import { User } from 'src/user/user.schema';

export type PayoutDocument = HydratedDocument<Payout>;
export enum PayoutStatus {
  INITIATED = 'INITIATED' ,
  // PROCESSING = 'PROCESSING',
  PROCESSING = 'PENDING',
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
}

@Schema({ timestamps: true })
export class Payout extends Document  {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' })
  transactionId: Transaction;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop({ default: 'INITIATED' })
  status: PayoutStatus;

  @Prop({ required: true })
  reference: string;

  @Prop({ required: true })
  type: 'bank' | 'mobile_money' | 'wallet';

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  sourceCurrency: string;

  @Prop({ required: true })
  destinationCurrency: string;

  @Prop()
  narration?: string;

  // Dest specifics
  @Prop()
  accountBankCode?: string;

  @Prop()
  accountNumber?: string;

  @Prop({ type: Object })
  raw?: any; // API response}
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);
