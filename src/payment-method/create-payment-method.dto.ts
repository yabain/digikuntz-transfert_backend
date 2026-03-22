import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethodProvider } from './payment-method.schema';

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'Orange Money' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsNotEmpty()
  statusPayin: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsNotEmpty()
  statusPayout: boolean;

  @ApiProperty({ example: 'https://cdn.example.com/payment-methods/om.png' })
  @IsString()
  @IsNotEmpty()
  image: string;

  @ApiProperty({ example: '687e4bff30550a0b4917bc77' })
  @IsMongoId()
  countryId: string;

  @ApiProperty({ example: 'FW_OM_CM' })
  @IsMongoId()
  code: string;

  @ApiProperty({ example: 'XAF' })
  @IsMongoId()
  currency: string;

  @ApiProperty({
    enum: PaymentMethodProvider,
    example: PaymentMethodProvider.FLUTTERWAVEXAF,
  })
  @IsEnum(PaymentMethodProvider)
  provider: PaymentMethodProvider;

  @ApiProperty({ example: 3 })
  @IsNumber()
  @Min(0)
  taxesPayment: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(0)
  taxesTransfer: number;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  minAmount: number;

  @ApiProperty({ example: 1000000 })
  @IsNumber()
  @Min(0)
  maxAmount: number;
}

