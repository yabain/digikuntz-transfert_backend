/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @IsString()
  @IsNotEmpty()
  readonly class: string;

  @IsString()
  @IsNotEmpty()
  readonly cover: string;

  @IsString()
  @IsNotEmpty()
  readonly icon: string;

  @IsString()
  @IsNotEmpty()
  readonly value: string;

  @IsString()
  @IsNotEmpty()
  readonly varTranslate: string;
}
