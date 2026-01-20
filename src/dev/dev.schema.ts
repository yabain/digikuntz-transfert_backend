import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { User } from 'src/user/user.schema';

@Schema({
  timestamps: true,
})
export class Dev extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop()
  publicKey: string;

  @Prop()
  secretKey: string;

  @Prop()
  apiPassword: string;

  @Prop()
  status: boolean;

}

export const DevSchema = SchemaFactory.createForClass(Dev);
