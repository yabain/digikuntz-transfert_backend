/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { User } from '../../user/user.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import { Plans } from '../plans.schema';

export enum SubscriptionCycle {
  YEAR = 'yearly',
  MONTH = 'monthly',
  WEEK = 'weekly',
  DAY = 'dayly'
}
@Schema({
  timestamps: true,
})
export class Subscription extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  planAuthor: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Plans' })
  planId: Plans;

  @Prop()
  quantity: number;

  @Prop()
  cycle: SubscriptionCycle;

  @Prop()
  startDate: Date;

  @Prop()
  endDate: Date;

  @Prop()
  status: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
