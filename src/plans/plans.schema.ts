/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { User } from '../user/user.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';

export enum PlansCycle {
  YEAR = 'yearly',
  MONTH = 'monthly',
  WEEK = 'weekly',
  DAY = 'dayly'
}
@Schema({
  timestamps: true,
})
export class Plans extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  author: User;

  @Prop()
  title: string;

  @Prop()
  subTitle: string;

  @Prop()
  imageUrl: string;

  @Prop()
  cycle: PlansCycle;

  @Prop()
  description: string;

  @Prop()
  isActive: boolean;

  @Prop()
  price: number;

  @Prop()
  currency: string;

  @Prop()
  subscriberNumber: number;
}

export const PlansSchema = SchemaFactory.createForClass(Plans);
