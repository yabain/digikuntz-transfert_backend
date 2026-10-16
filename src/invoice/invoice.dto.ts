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
}
