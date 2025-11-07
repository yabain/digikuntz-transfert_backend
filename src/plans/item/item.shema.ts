/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { Plans } from '../plans.schema'
import { User } from '../../user/user.schema'
import { Subscription } from '../subscription/subscription.schema';
import { Transaction } from 'src/transaction/transaction.schema';

@Schema({
  timestamps: true,
})
export class Item extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Plans' })
  plansId: Plans;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' })
  subscriptionId: Subscription;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  receiverId: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' })
  transactionId: Transaction;

  @Prop()
  dateStart: string;

  @Prop()
  dateEnd: string;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
