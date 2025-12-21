/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsOptional } from 'class-validator';
import { Subscription } from '../subscription/subscription.schema';
import { User } from 'src/user/user.schema';
import { Plans } from '../plans.schema';
import { Transaction } from 'src/transaction/transaction.schema';
import { Types } from 'mongoose';

export class CreateItemDto {

  @IsNotEmpty()
  readonly plansId: Plans | Types.ObjectId | string;

  @IsNotEmpty()
  readonly userId: User | Types.ObjectId | string;

  @IsNotEmpty()
  receiverId: User | Types.ObjectId | string;
  
  @IsNotEmpty()
  subscriptionId: Subscription | Types.ObjectId | string;
  
  @IsOptional()
  transactionId?: Transaction | Types.ObjectId | string;

  @IsNotEmpty()
  dateStart: string | Date;

  @IsNotEmpty()
  dateEnd: string | Date;

}
