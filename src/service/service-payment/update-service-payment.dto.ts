/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Transaction } from 'src/transaction/transaction.schema';
import { User } from '../../user/user.schema';
import { Service } from '../service.schema';
import {
  IsEmpty,
  IsNotEmpty, IsOptional,
} from 'class-validator';

export class UpdateServicePaymentDto {

  @IsEmpty({ message: 'You cannot pass userId' })
  userId: User;

  @IsEmpty({ message: 'You cannot pass userId' })
  receiverId: User; 

  @IsEmpty({ message: 'You cannot pass ServiceId' })
  @IsOptional()
  serviceId: Service;

  @IsEmpty({ message: 'You cannot pass TransactionId' })
  @IsOptional()
  transactionId: Transaction;

  @IsOptional()
  quantity: number;
}
