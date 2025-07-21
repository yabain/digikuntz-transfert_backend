/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  readonly name: string;

  @IsString()
  @IsNotEmpty()
  readonly countryId: string;
}
