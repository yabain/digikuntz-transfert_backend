import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class System extends Document {
  @Prop()
  defaultLang: string;

  @Prop()
  appVersion: string;

  @Prop()
  invoiceTaxes: number;

  @Prop()
  paymentGatwayAPIKey: string;

  @Prop()
  racineLink: string;
}

export const SystemSchema = SchemaFactory.createForClass(System);
