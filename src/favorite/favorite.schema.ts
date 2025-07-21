import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { User } from 'src/user/user.schema';
import { Event } from 'src/event/event.schema';

@Schema({
  timestamps: true,
})
export class Favorite extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  userId: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Event' })
  eventId: Event;
}

export const FavoriteSchema = SchemaFactory.createForClass(Favorite);
