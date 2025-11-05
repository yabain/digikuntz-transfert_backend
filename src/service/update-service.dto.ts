/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { User } from '../user/user.schema';
import { OptionsService } from './options-service/options-service.shema';
import {
  IsString,
  IsOptional,
  MinLength,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsEmpty,
} from 'class-validator';

export class UpdateServiceDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly author: User;

  @IsString()
  @IsOptional()
  @MinLength(3)
  readonly title: string;

  @IsString()
  @IsOptional()
  @MinLength(3)
  readonly subTitle: string;

  @IsString()
  @IsOptional()
  readonly imageUrl: string;

  @IsString()
  @IsOptional()
  readonly description: string;

  @IsOptional()
  readonly options: OptionsService[];

  @IsBoolean()
  @IsOptional()
  readonly isActive: boolean;

  @IsNumber()
  @IsOptional()
  readonly price: number;

  @IsString()
  @IsOptional()
  readonly currency: string;

}
