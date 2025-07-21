import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';

@Schema({
  timestamps: true,
})
export class TicketClasses extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Event' })
  eventId: Event;

  @Prop()
  name: string;

  @Prop()
  price: number;

  @Prop()
  quantity: number;

  @Prop()
  taken: number;

  @Prop()
  description: string;
}

export const TicketClassesSchema = SchemaFactory.createForClass(TicketClasses);
