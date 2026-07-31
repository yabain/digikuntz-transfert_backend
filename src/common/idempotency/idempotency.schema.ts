import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'idempotency_keys' })
export class IdempotencyRecord extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ type: Object })
  response?: any;
}

export const IdempotencyRecordSchema = SchemaFactory.createForClass(IdempotencyRecord);
IdempotencyRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
