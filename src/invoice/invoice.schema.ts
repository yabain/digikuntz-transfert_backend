import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { User } from 'src/user/user.schema';
import { Transaction } from 'src/transaction/transaction.schema';

export enum InvoiceStatus {
  DRAFT = 'draft',
  COMPLETED = 'completed',
  PAYING = 'paying',
  PAYED = 'payed',
  ARCHIVED = 'archived',
}

@Schema({ _id: false })
export class InvoiceItem {
  @Prop({ required: true, trim: true })
  designation: string;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  totalPrice: number;
}

@Schema({
  timestamps: true,
})
export class Invoice {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name, required: true, index: true })
  userId: string;

  @Prop({ trim: true })
  name?: string;

  @Prop({ required: true, uppercase: true, trim: true })
  currency: string;

  @Prop({ default: false })
  payed: boolean;

  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.DRAFT, index: true })
  status: InvoiceStatus;

  @Prop({ type: [InvoiceItem], default: [] })
  items: InvoiceItem[];

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ default: () => new Date() })
  invoiceDate: Date;

  @Prop()
  paymentDate?: Date;

  @Prop()
  paymentStartedAt?: Date;

  @Prop({ trim: true })
  paymentLink?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Transaction.name })
  transactionId?: string;

  @Prop({ trim: true })
  payerName?: string;

  @Prop({ trim: true })
  payerPhone?: string;

  @Prop({ lowercase: true, trim: true })
  payerEmail?: string;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ userId: 1, createdAt: -1 });
InvoiceSchema.index({ status: 1, createdAt: -1 });
