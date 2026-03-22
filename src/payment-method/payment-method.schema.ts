import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { Country } from 'src/country/country.schema';

export enum PaymentMethodProvider {
  FLUTTERWAVENGN = 'FlutterwaveNGN',
  FLUTTERWAVEXAF = 'FlutterwaveXAF',
  PAYSTACKKES = 'PaystackKES',
  NONE = 'none',
}

@Schema({
  timestamps: true,
})
export class PaymentMethod extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  statusPayin: boolean;

  @Prop({ required: true, trim: true })
  statusPayout: boolean;

  @Prop({ required: true, trim: true })
  image: string;

  @Prop({ required: true, trim: true })
  currency: string;

  @Prop({ required: true, trim: true })
  code: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: true  })
  countryId: Country;

  @Prop({
    required: true,
    enum: Object.values(PaymentMethodProvider),
    default: PaymentMethodProvider.NONE,
  })
  provider: PaymentMethodProvider;

  @Prop({ required: true, default: 0, min: 0 })
  taxesPayment: number;

  @Prop({ required: true, default: 0, min: 0 })
  taxesTransfer: number;

  @Prop({ required: true, min: 0 })
  minAmount: number;

  @Prop({ required: true, min: 0 })
  maxAmount: number;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);
PaymentMethodSchema.index({ countryId: 1, provider: 1, name: 1 }, { unique: true });

