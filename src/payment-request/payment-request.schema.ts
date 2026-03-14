import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Transaction } from 'src/transaction/transaction.schema';
import { User } from 'src/user/user.schema';

export type PaymentRequestDocument = HydratedDocument<PaymentRequest>;

export enum PaymentRequestStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  CANCELED = 'canceled',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class PaymentRequest {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true,
    unique: true,
  })
  transactionId: Transaction;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: User;

  @Prop({
    type: String,
    enum: PaymentRequestStatus,
    default: PaymentRequestStatus.PENDING,
  })
  status: PaymentRequestStatus;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: String, required: true })
  currency: string;
}

export const PaymentRequestSchema = SchemaFactory.createForClass(PaymentRequest);
PaymentRequestSchema.index({ userId: 1, createdAt: -1 });

