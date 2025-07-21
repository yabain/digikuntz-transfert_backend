import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class City extends Document {
  @Prop({ unique: true })
  name: string;

  @Prop()
  countryId: string;
}

export const CitySchema = SchemaFactory.createForClass(City);
