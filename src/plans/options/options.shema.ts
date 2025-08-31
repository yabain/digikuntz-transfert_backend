/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { Plans } from '../plans.schema';

@Schema({
  timestamps: true,
})
export class Options extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' })
  plansId: Plans;

  @Prop()
  title: string;

  @Prop()
  isActive: boolean;
}

export const OptionsSchema = SchemaFactory.createForClass(Options);
