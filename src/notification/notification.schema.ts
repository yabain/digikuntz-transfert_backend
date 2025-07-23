import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { User } from '../user/user.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import { Transaction } from 'src/transaction/transaction.schema';
import { Alert } from 'src/alert/alert.schema';

export enum NotifType {
  EVENT_CREATION = 'eventCreation',
  APP_UPDATE = 'appUpdate',
}

@Schema({
  timestamps: true,
})
export class Notification extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userFromId: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userToId: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' })
  transactionId: Transaction;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Alert' })
  alertId: Alert;

  @Prop()
  type: NotifType;

  @Prop()
  message: string;

  @Prop()
  isRead: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
