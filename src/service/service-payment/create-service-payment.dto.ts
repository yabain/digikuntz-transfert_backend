/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Transaction } from 'src/transaction/transaction.schema';
import { User } from '../../user/user.schema';
import { Service } from '../service.schema';
import {
  IsNotEmpty,
} from 'class-validator';

export class CreateServicePaymentDto {

  @IsNotEmpty()
  userId: User;

  @IsNotEmpty()
  receiverId: User; // plan author Id

  @IsNotEmpty()
  serviceId: Service;

  @IsNotEmpty()
  transactionId: Transaction

  @IsNotEmpty()
  quantity: number;
}
