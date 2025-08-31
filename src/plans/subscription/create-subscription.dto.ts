/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { User } from '../../user/user.schema';
import { Options } from '../options/options.shema';
import { SubscriptionCycle } from './subscription.schema';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsEmpty,
} from 'class-validator';

export class CreateSubscriptionDto {
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

  @IsEnum(SubscriptionCycle, {
    message: 'Enter corect SubscriptionCycle : Public or Private',
  })
  @IsNotEmpty()
  readonly cycle: SubscriptionCycle;

  @IsString()
  @IsNotEmpty()
  readonly description: string;

  @IsNotEmpty()
  readonly options: Options[];

  @IsBoolean()
  @IsNotEmpty()
  readonly isActive: boolean;

  @IsNumber()
  @IsNotEmpty()
  readonly price: number;

  @IsString()
  @IsNotEmpty()
  readonly currency: string;

  @IsNumber()
  @IsNotEmpty()
  readonly subscriberNumber: number;

}
