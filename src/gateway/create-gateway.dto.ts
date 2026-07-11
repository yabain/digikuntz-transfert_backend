import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class CreateGatewayDto {
  @ApiProperty({ example: 'Flutterwave XAF' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Payment gateway for XAF transactions', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'https://example.com/image.png', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ enum: ['flutterwave', 'paystack', 'mpesa'] })
  @IsString()
  @IsIn(['flutterwave', 'paystack', 'mpesa'])
  type: string;

  @ApiProperty({ enum: ['XAF', 'NGN', 'KES'] })
  @IsString()
  @IsIn(['XAF', 'NGN', 'KES'])
  currency: string;

  @ApiProperty({ description: 'Credentials object specific to the gateway type' })
  @IsObject()
  credentials: Record<string, any>;

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
