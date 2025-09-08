import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Mail extends Document {
  @Prop()
  smtpHost: string;

  @Prop()
  smtpPort: string;

  @Prop()
  smtpSecure: boolean;

  @Prop()
  smtpUser: string;

  @Prop()
  smtpPassword: string;

  @Prop()
  status: boolean; // True if linked sucsseful an false if connexion failed
}

export const MailSchema = SchemaFactory.createForClass(Mail);
