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
  appName: string;

  @Prop()
  appLogoUrl: string;

  @Prop()
  invoiceTaxes: number;

  @Prop()
  transferTaxes: number;

  @Prop()
  niu: number;

  @Prop()
  rccm: number;

  @Prop()
  addressLine1: string;

  @Prop()
  companyName: string;

  @Prop()
  defaultCurrency: string;

  @Prop()
  companyEmail: string; // email list with ";" for separation eg: "test@gmail.com;exemple@gmail.com"

  @Prop()
  companyWhatsapp: string; // whatsapp number list with ";" for separation eg: "237 677889900; 237 699887766"

  @Prop()
  addressLine2: string;

  @Prop()
  paymentGatwayAPIKey: string;

  @Prop()
  racineLink: string;

  @Prop()
  facebook: string;

  @Prop()
  website: string;

  @Prop()
  linkedIn: string;

  @Prop()
  instagram: string;

  @Prop()
  twitter: string;

}

export const SystemSchema = SchemaFactory.createForClass(System);
