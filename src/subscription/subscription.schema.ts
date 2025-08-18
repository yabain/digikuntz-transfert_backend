import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { User } from '../user/user.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';

export enum SubscriptionCycle {
  YEAR = 'year',
  MONTH = 'month',
  WEEK = 'week',
  DAY = 'day'
}
@Schema({
  timestamps: true,
})
export class Subscription extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  autor: User;

  @Prop()
  title: string;

  @Prop()
  subTitle: string;

  @Prop()
  imageUrl: string;

  @Prop()
  cycle: SubscriptionCycle;

  @Prop()
  description: string;

  @Prop()
  status: boolean;

  @Prop()
  price: number;

  @Prop()
  subscriberNumber: number;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
