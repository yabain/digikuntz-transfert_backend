import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class WhatsappQr extends Document {
  @Prop({ required: true })
  qr: string;

  @Prop()
  status: boolean; // True if linked sucsseful an false if connexion failed

  @Prop()
  message: string;

  @Prop()
  code: string;

  @Prop()
  phone: string;
}

export const WhatsappQrSchema = SchemaFactory.createForClass(WhatsappQr);
