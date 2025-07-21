import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { User } from 'src/user/user.schema';

export enum AlertType {
  SYSTEM = 'system',
  EVENT = 'event',
  SECURITY = 'security',
  PAYMENT = 'payment',
}

@Schema({
  timestamps: true,
})
export class Alert extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop()
  alertType: AlertType;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  objectId: string;

  @Prop()
  title: string;

  @Prop()
  message: string;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
