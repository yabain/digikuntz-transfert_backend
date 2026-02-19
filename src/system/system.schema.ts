import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class System extends Document {
  @Prop()
  defaultLang: string;

  @Prop()
  appVersion: string;

  @Prop()
  appName: string;

  @Prop()
  invoiceTaxes: number;

  @Prop()
  paymentGatwayAPIKey: string;

  @Prop()
  racineLink: string;

  @Prop()
  EmailToAlert: string; // email list with ";" for separation eg: "test@gmail.com;exemple@gmail.com"

  @Prop()
  WhatsappToAlert: string; // whatsapp number list with ";" for separation eg: "237 677889900; 237 699887766"

  @Prop()

}

export const SystemSchema = SchemaFactory.createForClass(System);
