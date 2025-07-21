import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class RevokedToken extends Document {
  @Prop({ unique: true })
  token: string;
}

export const RevokedTokenSchema = SchemaFactory.createForClass(RevokedToken);
