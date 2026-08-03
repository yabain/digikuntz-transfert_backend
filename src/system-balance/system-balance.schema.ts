import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class SystemBalance extends Document {
  @Prop({ required: true, unique: true, uppercase: true })
  currency: string;

  @Prop({ default: 0, min: 0 })
  balance: number;
}

export const SystemBalanceSchema = SchemaFactory.createForClass(SystemBalance);
