/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';

@Schema({
  timestamps: true,
})
export class Options extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' })
  subscriptionId: Event;

  @Prop()
  name: string;

  @Prop()
  isActive: boolean;

  @Prop()
  description: string;
}

export const OptionsSchema = SchemaFactory.createForClass(Options);
