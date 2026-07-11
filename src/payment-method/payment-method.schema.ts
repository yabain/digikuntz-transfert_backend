import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { Country } from 'src/country/country.schema';
import { Gateway } from 'src/gateway/gateway.schema';

export enum PaymentMethodProvider {
  FLUTTERWAVENGN = 'FlutterwaveNGN',
  FLUTTERWAVEXAF = 'FlutterwaveXAF',
  PAYSTACKKES = 'PaystackKES',
  NONE = 'none',
}

export type PaymentMethodType = 'mobile' | 'card' | 'bank';

@Schema({
  timestamps: true,
})
export class PaymentMethod extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ required: true, enum: ['mobile', 'card', 'bank'], default: 'mobile' })
  type: PaymentMethodType;

  @Prop({ trim: true, default: '' })
  code: string;

  @Prop({ required: true, trim: true })
  statusPayin: boolean;

  @Prop({ required: true, trim: true })
  statusPayout: boolean;

  @Prop({ trim: true, default: '' })
  image: string;

  @Prop({ required: true, trim: true })
  currency: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Country' })
  countryId: Country;

  @Prop({
    enum: Object.values(PaymentMethodProvider),
    default: PaymentMethodProvider.NONE,
  })
  provider: PaymentMethodProvider;

  @Prop({ default: 0, min: 0 })
  taxesPayment: number;

  @Prop({ default: 0, min: 0 })
  taxesTransfer: number;

  @Prop({ min: 0 })
  minAmount: number;

  @Prop({ min: 0 })
  maxAmount: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Gateway' })
  gatewayId: Gateway;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);
PaymentMethodSchema.index({ countryId: 1, provider: 1, name: 1 }, { unique: true });
