import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import { User } from 'src/user/user.schema';
import { Fundraising } from './fundraising.schema';
import { Transaction } from 'src/transaction/transaction.schema';

@Schema({ timestamps: true })
export class Donation {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Fundraising.name, required: true })
  fundraisingId: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name, required: true })
  fundraisingCreatorId: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name, required: true })
  donorId: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Transaction.name, required: true, unique: true })
  transactionId: string;

  @Prop({ required: true, min: 1 })
  amount: number;

  @Prop({ required: true, trim: true })
  currency: string;

  @Prop({ default: true })
  visibility: boolean;

  @Prop({ default: '' })
  message: string;

  @Prop({ default: 'successful' })
  status: string;
}

export type DonationDocument = Donation & Document;
export const DonationSchema = SchemaFactory.createForClass(Donation);

DonationSchema.index({ fundraisingId: 1, createdAt: -1 });
DonationSchema.index({ donorId: 1, createdAt: -1 });
