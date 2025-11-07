import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateExchangeDto {
  @IsString()
  @IsNotEmpty()
  readonly disclaimer: string;

  @IsNumber()
  @IsNotEmpty()
  readonly license: number;

  @IsNumber()
  @IsNotEmpty()
  readonly timestamp: number;

  @IsString()
  @IsNotEmpty()
  readonly base: string;

  @IsString()
  @IsNotEmpty()
  readonly rates: string;
}
