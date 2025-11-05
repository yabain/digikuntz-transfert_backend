/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { User } from '../../user/user.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import { Service } from '../service.schema';

@Schema({
  timestamps: true,
})
export class ServicePayment extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  receiverId: User; 

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Service' })
  serviceId: Service;

  @Prop()
  quantity: number;
}

export const ServicePaymentSchema = SchemaFactory.createForClass(ServicePayment);
