import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Transaction } from '../transaction/transaction.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import { HydratedDocument } from 'mongoose';
import { User } from 'src/user/user.schema';

/**
 * Outcome of a Flutterwave webhook delivery.
 *
 * `payin` is the row that was moved to a terminal state (null when the delivery
 * was a duplicate or matched nothing), and `ignored` explains why a delivery was
 * acknowledged without a write.
 */
export interface WebhookVerificationResult {
  status: 'ok';
  payin?: PayinDocument | null;
  ignored?: string;
}

export type PayinDocument = HydratedDocument<Payin>;

export enum PayinStatus {
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum PayinProvider {
  FLUTTERWAVE = 'flutterwave',
  PAYSTACK = 'paystack',
  MPESA = 'mpesa',
}

@Schema({
  timestamps: true,
})
export class Payin extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' })
  transactionId: Transaction;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop({ required: true, unique: true })
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

  /**
   * Default MUST be the enum value: the previous literal `'PENDING'` is not a
   * valid `PayinStatus`, so any document created without an explicit status was
   * invisible to `findPending({ status: 'pending' })` and never reconciled.
   *
   * Deliberately no `enum` constraint here: legacy documents still carry the
   * invalid `'PENDING'` value, and validating on save would make them
   * unsaveable. The repair of those rows is a one-shot deploy step.
   */
  @Prop({ default: PayinStatus.PENDING })
  status: PayinStatus;

  @Prop()
  channel: string;

  @Prop()
  redirectUrl?: string; // frontend success URL

  @Prop({ type: Object })
  raw?: any; // full payload for audit

  /**
   * Failure reason. Declared because the code already writes `error:` in
   * `verifyPayin` / `verifyPayinByTxRef`; without this path Mongoose strict mode
   * silently dropped it, losing the reason a charge failed.
   */
  @Prop({ type: Object })
  error?: any;

  /** Caller metadata (e.g. `{ flow: 'direct_charge' }`); `initPayin` writes it. */
  @Prop({ type: Object, default: {} })
  meta?: Record<string, any>;

  @Prop({ default: PayinProvider.FLUTTERWAVE })
  provider: PayinProvider;

  /**
   * Set by Mongoose (`timestamps: true`) and already referenced by the index
   * below.
   *
   * Declared WITHOUT `@Prop()` on purpose: the path already exists at runtime, so
   * decorating it would risk a duplicate path. Only the TypeScript declaration
   * was missing, which is why callers had to type collections as `any[]` to read
   * `createdAt`.
   */
  createdAt?: Date;
  updatedAt?: Date;
}

export const PayinSchema = SchemaFactory.createForClass(Payin);
PayinSchema.index({ status: 1, createdAt: -1 });
PayinSchema.index({ transactionId: 1 });
