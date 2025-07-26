import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { User } from 'src/user/user.schema';

export enum Currency {
  XAF = 'XAF',
  EU = 'EU',
  USD = 'USD',
}

@Schema({
  timestamps: true,
})
export class Exchange {
  @Prop()
  disclaimer: string;

  @Prop()
  license: string;

  @Prop()
  timestamp: number;

  @Prop({ unique: true })
  base: string;

  @Prop()
  rates: string;
}

export const ExchangeSchema = SchemaFactory.createForClass(Exchange);
