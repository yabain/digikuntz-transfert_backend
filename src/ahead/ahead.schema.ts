import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { City } from '../city/city.schema';
import { Country } from '../country/country.schema';
import { Event } from '../event/event.schema';

@Schema({
  timestamps: true,
})
export class Ahead extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Country' })
  countryId: Country;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'City' })
  cityId: City;

  @Prop({ unique: true, type: mongoose.Schema.Types.ObjectId, ref: 'Event' })
  eventId: Event;
}

export const AheadSchema = SchemaFactory.createForClass(Ahead);
