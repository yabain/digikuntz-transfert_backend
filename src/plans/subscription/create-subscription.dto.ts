/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { User } from '../../user/user.schema';
import { Options } from '../options/options.shema';
import { Plans } from '../plans.schema';
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

  @IsNotEmpty()
  userId: User;

  @IsNotEmpty()
  planAuthor: User;

  @IsNotEmpty()
  planId: Plans;

  @IsNotEmpty()
  quantity: number;

  @IsNotEmpty()
  cycle: SubscriptionCycle;

  @IsNotEmpty()
  startDate: Date;

  @IsNotEmpty()
  endDate: Date;

  @IsNotEmpty()
  status: boolean;
}
