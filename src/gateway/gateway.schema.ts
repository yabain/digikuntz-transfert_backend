import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GatewayType = 'flutterwave' | 'paystack' | 'mpesa';

export interface MpesaSubAccountBalance {
  currentBalance: number;
  availableBalance: number;
  reservedBalance: number;
  unclearedBalance: number;
  currency: string;
}

export interface MpesaBalances {
  workingAccount?: MpesaSubAccountBalance;
  utilityAccount?: MpesaSubAccountBalance;
  merchantAccount?: MpesaSubAccountBalance;
}

@Schema({ timestamps: true })
export class Gateway extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ default: '' })
  imageUrl: string;

  @Prop({ required: true, enum: ['flutterwave', 'paystack', 'mpesa'] })
  type: GatewayType;

  @Prop({ required: true, enum: ['XAF', 'NGN', 'KES'] })
  currency: string;

  @Prop({ required: true })
  credentials: string;

  @Prop({ default: true })
  isActive: boolean;

  /** Commission (%) prélevée par le provider gateway (Flutterwave, Paystack, M-Pesa)
   *  sur chaque transaction réussie. Utilisée lors du crédit du solde système. */
  @Prop({ default: 0 })
  providerCommission: number;

  @Prop({ type: Object, default: {} })
  balance: Record<string, any>;
}

export const GatewaySchema = SchemaFactory.createForClass(Gateway);
