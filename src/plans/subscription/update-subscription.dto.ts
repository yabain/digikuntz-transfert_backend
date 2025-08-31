/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { User } from '../../user/user.schema';
import { Options } from '../options/options.shema';
import { SubscriptionCycle } from './subscription.schema';
import {
  IsString,
  IsOptional,
  MinLength,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsEmpty,
} from 'class-validator';

export class UpdateSubscriptionDto {
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

  @IsEnum(SubscriptionCycle, {
    message: 'Enter corect SubscriptionCycle : Public or Private',
  })
  @IsOptional()
  readonly cycle: SubscriptionCycle;

  @IsString()
  @IsOptional()
  readonly description: string;

  @IsOptional()
  readonly options: Options[];

  @IsBoolean()
  @IsOptional()
  readonly isActive: boolean;

  @IsNumber()
  @IsOptional()
  readonly price: number;

  @IsString()
  @IsOptional()
  readonly currency: string;

  @IsNumber()
  @IsOptional()
  readonly subscriberNumber: number;

}
