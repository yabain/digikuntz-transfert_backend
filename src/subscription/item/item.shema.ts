/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';

@Schema({
  timestamps: true,
})
export class Item extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' })
  subscriptionId: Event;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: Event;

  @Prop()
  isActive: boolean;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
