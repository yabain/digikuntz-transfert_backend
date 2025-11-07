import { IsString, IsOptional } from 'class-validator';

export class UpdateExchangeDto {
  @IsOptional()
  readonly disclaimer: string;

  @IsOptional()
  readonly license: string;

  @IsOptional()
  readonly timestamp: number;

  @IsString()
  @IsOptional()
  readonly base: string;

  @IsString()
  @IsOptional()
  readonly rates: string;
}
