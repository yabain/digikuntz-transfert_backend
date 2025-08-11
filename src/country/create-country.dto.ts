/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsEmpty,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCountryDto {
  @ApiPropertyOptional({
    description: 'Country ID (should not be provided by client)',
  })
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly id: string;

  @ApiProperty({
    example: 'Cameroon',
    description: 'Country name',
    minLength: 4,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  readonly name: string;

  @ApiProperty({ example: '237', description: 'Country code' })
  @IsString()
  @IsNotEmpty()
  readonly code: string;

  @ApiProperty({
    example: 'https://example.com/flag.png',
    description: 'URL of the country flag',
  })
  @IsString()
  @IsNotEmpty()
  readonly flagUrl: string;

  @ApiProperty({ example: 'XAF', description: 'Country currency code' })
  @IsString()
  @IsNotEmpty()
  readonly currency: string;

  @ApiProperty({
    example: true,
    description: 'Country status (active/inactive)',
  })
  @IsBoolean()
  @IsNotEmpty()
  readonly status: boolean;
}
