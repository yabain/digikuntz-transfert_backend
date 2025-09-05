import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PayoutDocument = HydratedDocument<Payout>;
export type PayoutStatus = 'INITIATED' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED';

@Schema({ timestamps: true })
export class Payout {
  @Prop({ required: true })
  reference: string;

  @Prop({ required: true })
  type: 'bank' | 'mobile_money' | 'wallet';

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  sourceCurrency: string;

  @Prop({ required: true })
  destinationCurrency: string;

  @Prop()
  narration?: string;

  // Dest specifics
  @Prop()
  accountBankCode?: string;

  @Prop()
  accountNumber?: string;

  @Prop()
  mmCountry?: string;

  @Prop()
  mmProvider?: string;

  @Prop()
  msisdn?: string;

  @Prop()
  walletIdentifier?: string;

  @Prop({ default: 'INITIATED' })
  status: PayoutStatus;

  @Prop({ type: Object })
  raw?: any; // API response}
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);
