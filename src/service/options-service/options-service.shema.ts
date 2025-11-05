/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { Service } from '../service.schema';

@Schema({
  timestamps: true,
})
export class OptionsService extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' })
  serviceId: Service;

  @Prop()
  title: string;

  @Prop()
  isActive: boolean;
}

export const OptionsServiceSchema = SchemaFactory.createForClass(OptionsService);
