import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) actorId?: Types.ObjectId | null;
  @Prop() actorEmail?: string;
  @Prop() actorRole?: string;

  @Prop({ required: true }) action: string;

  @Prop() resourceType?: string;
  @Prop() resourceId?: string;
  @Prop() resourceLabel?: string;

  @Prop({ type: Object }) metadata?: Record<string, any>;

  @Prop() method?: string;
  @Prop() path?: string;
  @Prop() statusCode?: number;
  @Prop() durationMs?: number;

  @Prop() ip?: string;
  @Prop() userAgent?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
