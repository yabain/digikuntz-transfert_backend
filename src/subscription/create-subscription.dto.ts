/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { User } from '../user/user.schema';
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

export class CreateEventDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly autor: User;

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

  @IsBoolean()
  @IsNotEmpty()
  readonly status: boolean;

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
