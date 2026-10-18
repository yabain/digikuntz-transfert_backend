import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from './invoice.schema';

export class InvoiceItemDto {
  @IsString()
  @IsNotEmpty()
  designation: string;

  @Min(0)
  unitPrice: number;

  @Min(1)
  quantity: number;

  @Min(0)
  totalPrice: number;
}

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(['customer', 'organization'])
  commissionPayer?: 'customer' | 'organization';
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['customer', 'organization'])
  commissionPayer?: 'customer' | 'organization';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}

export class MarkInvoicePaidDto {
  @IsString()
  @IsNotEmpty()
  payerName: string;

  @IsString()
  @IsNotEmpty()
  payerPhone: string;

  @IsOptional()
  @IsString()
  payerEmail?: string;
}

export class InitiateInvoicePaymentDto {
  @IsString()
  @IsNotEmpty()
  payerName: string;

  @IsString()
  @IsNotEmpty()
  payerPhone: string;

  @IsOptional()
  @IsString()
  payerEmail?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string;

  /**
   * Payment route chosen by the payer.
   *
   * - `mobile_money`: direct charge — the payer approves a USSD / app push on
   *   their phone, no checkout link is opened;
   * - `card`: reserved for the upcoming card integration (falls back to the
   *   hosted checkout for now).
   *
   * Omitted entirely → the historical hosted-checkout behaviour, unchanged.
   */
  @IsOptional()
  @IsIn(['mobile_money', 'card'])
  paymentMethod?: 'mobile_money' | 'card';

  /**
   * Optional operator override (`MTN`, `ORANGEMONEY`, `AIRTEL`, ...).
   *
   * Normally omitted: the operator is derived from the payer's phone number. It
   * is only honoured when the prefix cannot be resolved, which lets the UI offer
   * an explicit operator picker without ever contradicting a clear number.
   */
  @IsOptional()
  @IsString()
  network?: string;

  /** Opaque device identifier forwarded to Flutterwave for fraud scoring. */
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
