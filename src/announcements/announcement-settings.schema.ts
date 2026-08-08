import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AnnouncementSettingsDocument = HydratedDocument<AnnouncementSettings>;

@Schema({ timestamps: true })
export class AnnouncementSettings {
  @Prop({ type: String, default: '' }) headerHtml: string;
  @Prop({ type: String, default: '' }) footerHtml: string;
}

export const AnnouncementSettingsSchema =
  SchemaFactory.createForClass(AnnouncementSettings);