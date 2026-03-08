import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import { User } from 'src/user/user.schema';

export enum FundraisingVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

@Schema({ timestamps: true })
export class Fundraising {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  subTitle: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ required: true, min: 1 })
  targetAmount: number;

  @Prop({ default: 0, min: 0 })
  collectedAmount: number;

  @Prop({ required: true, trim: true })
  currency: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name, required: true })
  creatorId: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ enum: FundraisingVisibility, default: FundraisingVisibility.PUBLIC })
  visibility: FundraisingVisibility;

  @Prop({ default: true })
  status: boolean;

  @Prop({ default: '' })
  coverImageUrl: string;
}

export type FundraisingDocument = Fundraising & Document;
export const FundraisingSchema = SchemaFactory.createForClass(Fundraising);

FundraisingSchema.index({ creatorId: 1, createdAt: -1 });
FundraisingSchema.index({ status: 1, visibility: 1, createdAt: -1 });
FundraisingSchema.index({ endDate: 1 });
