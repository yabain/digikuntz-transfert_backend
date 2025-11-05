/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { User } from '../user/user.schema';
import { OptionsService } from './options-service/options-service.shema';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsEmpty,
} from 'class-validator';

export class CreateServiceDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly author: User;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  readonly title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  readonly subTitle: string;

  @IsString()
  @IsNotEmpty()
  readonly imageUrl: string;

  @IsString()
  @IsNotEmpty()
  readonly description: string;

  @IsNotEmpty()
  readonly options: OptionsService[];

  @IsBoolean()
  @IsNotEmpty()
  readonly isActive: boolean;

  @IsNumber()
  @IsNotEmpty()
  readonly price: number;

  @IsString()
  @IsNotEmpty()
  readonly currency: string;

}
