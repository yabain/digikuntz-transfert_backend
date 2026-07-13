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

  @Prop({ type: Object, default: {} })
  balance: Record<string, any>;
}

export const GatewaySchema = SchemaFactory.createForClass(Gateway);
