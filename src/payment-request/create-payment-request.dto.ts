import {
  IsEmail,
  IsIn,
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
  @IsOptional()
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

  @ApiPropertyOptional({
    example: '67d8b1f2e4b0a1c2d3e4f5a6',
    description: 'Optional gateway ID to use for payment processing',
  })
  @IsOptional()
  @IsString()
  gatewayId?: string;

  @IsOptional()
  @IsString()
  commissionPayer?: string;

  /**
   * Payment route chosen by the payer.
   *
   * - `mobile_money` (default): direct charge — USSD / app push on the payer's
   *   phone, no checkout link to open;
   * - `card`: reserved for the upcoming card integration (falls back to the
   *   hosted checkout for now).
   *
   * Omitted entirely → the historical hosted-checkout behaviour, unchanged.
   */
  @ApiPropertyOptional({
    enum: ['mobile_money', 'card'],
    example: 'mobile_money',
  })
  @IsOptional()
  @IsIn(['mobile_money', 'card'])
  paymentMethod?: 'mobile_money' | 'card';

  /**
   * Optional operator override (`MTN`, `ORANGEMONEY`, `AIRTEL`, ...). Normally
   * omitted: the operator is derived from the payer's phone number and this is
   * only honoured when the prefix cannot be resolved.
   */
  @ApiPropertyOptional({ example: 'MTN' })
  @IsOptional()
  @IsString()
  network?: string;

  /** Opaque device identifier forwarded to Flutterwave for fraud scoring. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
