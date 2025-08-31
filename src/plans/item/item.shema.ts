/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { Plans } from '../plans.schema'
import { User } from '../../user/user.schema'

@Schema({
  timestamps: true,
})
export class Item extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' })
  plansId: Plans;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop()
  isActive: boolean;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
