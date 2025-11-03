/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { User } from '../../user/user.schema';
import { Options } from '../options/options.shema';
import { Plans } from '../plans.schema';
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
  @IsOptional()
  userId: User;

  @IsOptional()
  receiverId: User; // Plan author Id

  @IsOptional()
  planId: Plans;

  @IsOptional()
  quantity: number;

  @IsOptional()
  cycle: SubscriptionCycle;

  @IsOptional()
  startDate: Date;

  @IsOptional()
  endDate: Date;

  @IsOptional()
  status: boolean;
}
