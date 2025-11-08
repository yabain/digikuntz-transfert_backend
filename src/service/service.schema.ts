/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { User } from '../user/user.schema';
import mongoose from 'mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Service extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  author: User;

  @Prop()
  title: string;

  @Prop()
  subTitle: string;

  @Prop()
  imageUrl: string;

  @Prop()
  description: string;

  @Prop()
  isActive: boolean;

  @Prop()
  price: number;

  @Prop()
  currency: string;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);

// Index pour optimiser les recherches
ServiceSchema.index({ author: 1 });
ServiceSchema.index({ title: 1 });
ServiceSchema.index({ isActive: 1 });
ServiceSchema.index({ createdAt: -1 });
ServiceSchema.index({ title: 'text', description: 'text' }); // Index de recherche textuelle
ServiceSchema.index({ author: 1, isActive: 1 }); // Index composé
