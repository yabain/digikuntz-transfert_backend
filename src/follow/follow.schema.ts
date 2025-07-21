import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { User } from 'src/user/user.schema';

@Schema({
  timestamps: true,
})
export class Follow extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  followId: User;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);
