import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'idempotency_keys' })
export class IdempotencyRecord extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ type: Object })
  response?: any;

  /**
   * `true` while the reservation owner is still running `fn()`. A reservation
   * is removed if `fn()` throws, and completed (`false`) once `response` is stored.
   */
  @Prop({ type: Boolean })
  inProgress?: boolean;
}

export const IdempotencyRecordSchema = SchemaFactory.createForClass(IdempotencyRecord);
IdempotencyRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
