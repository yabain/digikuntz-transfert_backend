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
  niu: string;

  @Prop()
  rccm: string;

  @Prop()
  companyName: string;

  @Prop()
  companyPhone1: string;

  @Prop()
  companyPhone2: string;

  @Prop()
  defaultCurrency: string;

  @Prop()
  companyEmail: string; // email list with ";" for separation eg: "test@gmail.com;exemple@gmail.com"

  @Prop()
  companyWhatsapp: string; // whatsapp number list with ";" for separation eg: "237 677889900; 237 699887766"

  @Prop({ default: true })
  whatsappNotificationsEnabled: boolean;

  @Prop({ default: true })
  emailNotificationsEnabled: boolean;

  @Prop()
  addressLine1: string;

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

  @Prop({
    type: [
      {
        currency: { type: String, required: true },
        minDeposit: { type: Number, default: 0 },
        maxDeposit: { type: Number, default: 0 },
        minWithdrawal: { type: Number, default: 0 },
        maxWithdrawal: { type: Number, default: 0 },
      },
    ],
    default: [],
  })
  transactionLimits: {
    currency: string;
    minDeposit: number;
    maxDeposit: number;
    minWithdrawal: number;
    maxWithdrawal: number;
  }[];
}

export const SystemSchema = SchemaFactory.createForClass(System);
