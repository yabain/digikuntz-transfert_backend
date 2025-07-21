import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Mail extends Document {
  @Prop({ required: true })
  mail: string;

  @Prop()
  status: boolean; // True if linked sucsseful an false if connexion failed
}

export const MailSchema = SchemaFactory.createForClass(Mail);
