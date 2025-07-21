import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class EventCategories extends Document {
  @Prop({ unique: true })
  name: string;

  @Prop()
  class: string;

  @Prop()
  cover: string;

  @Prop()
  icon: string;

  @Prop()
  value: string;

  @Prop()
  varTranslate: string;
}

export const EventCategoriesSchema =
  SchemaFactory.createForClass(EventCategories);
