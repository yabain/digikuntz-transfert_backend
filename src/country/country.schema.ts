import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Country extends Document {
  @Prop({ unique: true })
  name: string;

  @Prop({ unique: true })
  code: string;

  @Prop({ unique: true })
  flagUrl: string;
}

export const CountrySchema = SchemaFactory.createForClass(Country);
