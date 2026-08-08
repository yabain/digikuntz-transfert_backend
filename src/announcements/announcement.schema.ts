import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AnnouncementDocument = HydratedDocument<Announcement>;

export enum AnnouncementRecipientGroup {
  ALL_USERS = 'all_users',
  ALL_ADMINS = 'all_admins',
  ALL_PERSONAL = 'all_personal',
  ALL_ORGANISATIONS = 'all_organisations',
  ALL_PROSPECTS = 'all_prospects',
}

export enum AnnouncementStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}

export enum AnnouncementChannel {
  EMAIL = 'email',
}

@Schema({ _id: false })
export class AnnouncementRecipientSnapshot {
  @Prop() email?: string;
  @Prop() phone?: string;
  @Prop() userId?: string;
  @Prop() userName?: string;
  @Prop() userFirstName?: string;
  @Prop() userLastName?: string;
  @Prop() userPhone?: string;
}

export const AnnouncementRecipientSnapshotSchema =
  SchemaFactory.createForClass(AnnouncementRecipientSnapshot);

@Schema({ timestamps: true })
export class Announcement {
  @Prop({ enum: Object.values(AnnouncementChannel), default: AnnouncementChannel.EMAIL })
  channel: AnnouncementChannel;

  @Prop({ required: true, trim: true }) subject: string;
  @Prop({ required: true }) html: string;

  @Prop({ default: false }) useHeader: boolean;
  @Prop({ default: false }) useFooter: boolean;
  @Prop({ type: String, default: null }) headerHtml?: string | null;
  @Prop({ type: String, default: null }) footerHtml?: string | null;

  @Prop({ default: null }) attachmentUrl?: string;
  @Prop({ default: null }) attachmentPath?: string;
  @Prop({ default: null }) attachmentName?: string;
  @Prop({ default: null }) attachmentMimeType?: string;
  @Prop({ default: 0 }) attachmentSize?: number;

  @Prop({ enum: Object.values(AnnouncementRecipientGroup), default: null })
  recipientGroup?: AnnouncementRecipientGroup;

  @Prop({ type: [String], default: [] }) recipientEmails: string[];

  @Prop({ required: true }) recipientLabel: string;

  @Prop({ enum: Object.values(AnnouncementStatus), default: AnnouncementStatus.DRAFT })
  status: AnnouncementStatus;

  @Prop({ type: Date, default: null }) scheduledAt?: Date | null;
  @Prop({ type: Date, default: null }) sentAt?: Date | null;
  @Prop({ type: String, default: null }) failureReason?: string | null;

  @Prop({ default: 0 }) recipientCount: number;
  @Prop({ default: 0 }) successCount: number;
  @Prop({ default: 0 }) failureCount: number;

  @Prop({ type: [AnnouncementRecipientSnapshotSchema], default: [] })
  recipientsSnapshot: AnnouncementRecipientSnapshot[];

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;

  @Prop({ default: 0 }) currentWaveCount: number;
  @Prop({ default: 0 }) totalWaveFailures: number;
  @Prop({ default: 0 }) consecutiveFailures: number;
  @Prop({ default: false }) stoppedByFailure: boolean;
  @Prop({ type: Date, default: null }) nextProcessAt?: Date | null;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
AnnouncementSchema.index({ status: 1, scheduledAt: 1 });
AnnouncementSchema.index({ createdAt: -1 });
AnnouncementSchema.index({ status: 1, stoppedByFailure: 1, nextProcessAt: 1 });