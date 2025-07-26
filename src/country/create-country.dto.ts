/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsEmpty,
  IsBoolean,
} from 'class-validator';

export class CreateCountryDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly id: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  readonly name: string;

  @IsString()
  @IsNotEmpty()
  readonly code: string;

  @IsString()
  @IsNotEmpty()
  readonly flagUrl: string;

  @IsString()
  @IsNotEmpty()
  readonly currency: string;

  @IsBoolean()
  @IsNotEmpty()
  readonly status: boolean;
}
