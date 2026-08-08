import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Prospect extends Document {
  @Prop({ trim: true, default: '' })
  name: string;

  @Prop({ trim: true, lowercase: true, default: '' })
  email: string;

  @Prop({ trim: true, default: '' })
  phone: string;
}

export const ProspectSchema = SchemaFactory.createForClass(Prospect);
ProspectSchema.index(
  { email: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { email: { $type: 'string', $ne: '' } },
  },
);
ProspectSchema.index(
  { phone: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { phone: { $type: 'string', $ne: '' } },
  },
);
ProspectSchema.index({ createdAt: -1 });