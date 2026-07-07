import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class VisitEvent extends Document {
  @Prop({ unique: true, sparse: true })
  eventId?: string;

  @Prop({ required: true, trim: true })
  path: string;

  @Prop({ default: '' })
  title?: string;

  @Prop({ default: '' })
  sessionId?: string;

  @Prop({ default: '' })
  ip?: string;

  @Prop({ default: '' })
  userAgent?: string;
}

export const VisitEventSchema = SchemaFactory.createForClass(VisitEvent);

VisitEventSchema.index({ createdAt: -1 });
VisitEventSchema.index({ path: 1, createdAt: -1 });
