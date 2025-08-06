import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Newsletter extends Document {
  @Prop({ unique: true })
  name: string;

  @Prop()
  countryId: string;
}

export const NewsletterSchema = SchemaFactory.createForClass(Newsletter);
