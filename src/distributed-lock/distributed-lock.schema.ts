import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'distributed_locks' })
export class DistributedLock extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  owner: string;

  @Prop({ required: true })
  expiresAt: Date;
}

export const DistributedLockSchema =
  SchemaFactory.createForClass(DistributedLock);

// Mongo TTL sweeper removes stale locks even if a process crashes.
DistributedLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
