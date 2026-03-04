import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FundraisingVisibility } from './fundraising.schema';

export class CreateFundraisingDto {
  @ApiProperty({
    example: 'Back-to-School Fund 2026',
    description: 'Main fundraising title',
  })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({
    example: 'Help 120 children get school kits',
    description: 'Fundraising subtitle',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subTitle?: string;

  @ApiPropertyOptional({
    example:
      'This campaign funds school supplies and transportation costs for children.',
    description: 'Detailed fundraising description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 500000,
    description: 'Target amount for the fundraiser',
  })
  @IsNumber()
  @Min(1)
  targetAmount: number;

  @ApiPropertyOptional({
    example: 'XAF',
    description: 'Fundraising currency (must match user currency)',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    example: '2026-12-31T23:59:59.000Z',
    description: 'Fundraising closing date (ISO 8601)',
  })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    enum: FundraisingVisibility,
    example: FundraisingVisibility.PUBLIC,
    description: 'Fundraising visibility',
  })
  @IsOptional()
  @IsEnum(FundraisingVisibility)
  visibility?: FundraisingVisibility;

  @ApiPropertyOptional({
    example: true,
    description: 'Active/inactive status',
  })
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/fundraising/cover.jpg',
    description: 'Fundraising cover image URL',
  })
  @IsOptional()
  @IsString()
  coverImageUrl?: string;
}
