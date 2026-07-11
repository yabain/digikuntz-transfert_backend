import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
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

  @ApiProperty({ example: 'mobile', enum: ['mobile', 'card', 'bank'], required: false })
  @IsOptional()
  @IsIn(['mobile', 'card', 'bank'])
  type?: string;

  @ApiProperty({ example: 'ORANGEMONEY', required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ example: 'XAF', required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: 'Payment via Orange Money', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '687e4bff30550a0b4917bc77', required: false })
  @IsOptional()
  @IsMongoId()
  countryId?: string;

  @ApiProperty({
    enum: PaymentMethodProvider,
    example: PaymentMethodProvider.FLUTTERWAVEXAF,
    required: false,
  })
  @IsOptional()
  @IsEnum(PaymentMethodProvider)
  provider?: PaymentMethodProvider;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxesPayment?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxesTransfer?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsMongoId()
  gatewayId?: string;
}
