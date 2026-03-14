import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MobileMoneyPaymentRequestDto {
  @ApiProperty({
    example: '254790749940',
    description: 'Payer mobile money phone number in local or intl format',
  })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({
    example: 'm-pesa',
    description: 'Mobile money provider (e.g. m-pesa, atl)',
  })
  @IsNotEmpty()
  @IsString()
  provider: string;
}

export class CreatePaymentRequestDto {
  @ApiProperty({ example: 'client@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 500000, minimum: 1 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    type: MobileMoneyPaymentRequestDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => MobileMoneyPaymentRequestDto)
  mobile_money: MobileMoneyPaymentRequestDto;

  @ApiPropertyOptional({
    example: 'Invoice #INV-2026-001',
    description: 'Optional request reason/description',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

