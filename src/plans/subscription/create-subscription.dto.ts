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
  IsOptional,
} from 'class-validator';

export class CreateSubscriptionDto {

  @IsNotEmpty()
  userId: User;

  @IsNotEmpty()
  receiverId: User; // plan author Id

  @IsNotEmpty()
  planId: Plans;

  @IsOptional()
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
