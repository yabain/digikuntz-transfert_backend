import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { User } from '../user/user.schema';

export type BalanceMovementType = 'credit' | 'debit';

@Schema({ timestamps: true, collection: 'balance_movements' })
export class BalanceMovement extends Document {
  /** Unique idempotency key, e.g. `payin-credit:<transactionId>` */
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: User;

  @Prop({ required: true, enum: ['credit', 'debit'] })
  type: BalanceMovementType;

  @Prop({ required: true })
  amount: number;

  @Prop()
  currency?: string;
}

export const BalanceMovementSchema =
  SchemaFactory.createForClass(BalanceMovement);

BalanceMovementSchema.index({ userId: 1, createdAt: -1 });
