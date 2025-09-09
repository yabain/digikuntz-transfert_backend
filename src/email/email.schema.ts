import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Email extends Document {
  @Prop()
  from: string;

  @Prop()
  to: string;

  @Prop()
  subject: string;

  @Prop()
  status: boolean;
}

export const EmailSchema = SchemaFactory.createForClass(Email);
