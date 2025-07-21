import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { User } from '../user/user.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';
import { City } from 'src/city/city.schema';
import { Country } from 'src/country/country.schema';
import { EventCategories } from 'src/event-categories/event-categories.schema';
import { TicketClasses } from 'src/ticket-classes/ticket-classes.shema';

export enum EventType {
  PUBLIC = 'public',
  PRIVATE = 'private',
}
@Schema({
  timestamps: true,
})
export class Event extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  autor: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'City' })
  cityId: City;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Country' })
  countryId: Country;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'EventCategories' })
  categoryId: EventCategories;

  @Prop()
  title: string;

  @Prop()
  cover: string;

  @Prop()
  dateStart: Date;

  @Prop()
  dateEnd: Date;

  @Prop()
  timeStart: string;

  @Prop()
  timeEnd: string;

  @Prop()
  type: EventType;

  @Prop([{ type: Object }])
  ticketClasses: TicketClasses[];

  @Prop()
  description: string;

  @Prop()
  status: boolean;

  @Prop()
  paid: boolean;

  @Prop()
  location: string;

  @Prop()
  agreeTerms: boolean;

  @Prop()
  phone: string;

  @Prop()
  phone2: string;

  @Prop()
  onlineMeet: string;

  @Prop()
  whatsapp: string;

  @Prop()
  twitter: string;

  @Prop()
  instagram: string;

  @Prop()
  facebook: string;

  @Prop()
  externalLink: string;

  @Prop()
  linkedIn: string;

  @Prop()
  email: string;

  @Prop()
  address: string;
}

export const EventSchema = SchemaFactory.createForClass(Event);
