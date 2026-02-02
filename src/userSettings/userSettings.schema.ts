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

  @Prop()
  enableServices: boolean; // Enable Service section on user home page

  @Prop()
  enablePlan: boolean; // Enable Plan section on user's home page 

  @Prop()
  enableFundrasing: boolean; // Enable Fundraising section on user's home page 
}

export const UserSettingsSchema = SchemaFactory.createForClass(UserSettings);
