/* eslint-disable prettier/prettier */
import { IsString, IsNotEmpty, IsEmpty, IsBoolean } from 'class-validator';
import { Subscription } from '../subscription/subscription.schema';
import { User } from 'src/user/user.schema';
import { Plans } from '../plans.schema';
import { Transaction } from 'src/transaction/transaction.schema';

export class CreateItemDto {

  @IsNotEmpty()
  readonly plansId: Plans;

  @IsNotEmpty()
  readonly userId: User;

  @IsNotEmpty()
  receiverId: User;
  
  @IsNotEmpty()
  subscriptionId: Subscription;
  
  @IsNotEmpty()
  transactionId: Transaction;

  @IsNotEmpty()
  dateStart: string;

  @IsNotEmpty()
  dateEnd: string;

}
