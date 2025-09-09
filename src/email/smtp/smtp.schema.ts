import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';

export type SmtpDocument = HydratedDocument<Smtp>;
@Schema({ timestamps: true })
export class Smtp extends Document {
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

export const SmtpSchema = SchemaFactory.createForClass(Smtp);
