import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { User } from 'src/user/user.schema';

@Schema({
  timestamps: true,
})
export class UserSettings extends Document {
  
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true })
  userId: User;
  
  @Prop()
  layoutPosition: number;

  @Prop()
  layoutColor: number;

  @Prop()
  layoutTopColor: number;

  @Prop()
  layoutSidebarColor: number;

  @Prop()
  layoutWidth: number;

  @Prop()
  layoutPositionScroll: number;

  @Prop()
  layoutSidebarSize: number;

  @Prop()
  layoutSidebarView: number;
}

export const UserSettingsSchema = SchemaFactory.createForClass(UserSettings);
