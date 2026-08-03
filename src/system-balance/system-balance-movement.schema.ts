import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SystemBalanceMovementType = 'credit' | 'debit';

@Schema({ timestamps: true, collection: 'system_balance_movements' })
export class SystemBalanceMovement extends Document {
  /** Unique idempotency key, e.g. `system-fees-credit:<transactionId>` */
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true, enum: ['credit', 'debit'] })
  type: SystemBalanceMovementType;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, uppercase: true })
  currency: string;

  /** Référence liée (txRef d'un payin, reference d'un payout, note admin...) */
  @Prop({ default: '' })
  reference?: string;

  /** Description libre du mouvement */
  @Prop({ default: '' })
  description?: string;
}

export const SystemBalanceMovementSchema = SchemaFactory.createForClass(
  SystemBalanceMovement,
);

SystemBalanceMovementSchema.index({ currency: 1, createdAt: -1 });
