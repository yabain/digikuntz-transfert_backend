import {
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  IsEmail,
  IsNotEmpty,
} from 'class-validator';
import { Transaction } from 'src/transaction/transaction.schema';
import { User } from 'src/user/user.schema';
import { PayinStatus } from './payin.schema';

export class CreatePayinDto {
  @IsNotEmpty()
  transactionId: Transaction;

  @IsNotEmpty()
  userId: User;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  currency: string; // e.g. "XAF", "NGN"

  // @IsOptional()
  // @IsString()
  // txRef: string; // unique per attempt

  // @IsOptional()
  // @IsString()
  // flwTxId: string;

  @IsEmail()
  customerEmail: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  txRef?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string; // frontend success URL

  @IsOptional()
  @IsIn([
    'card',
    'bank_transfer',
    'mobilemoney',
    'ussd',
    'account',
    'barter',
    'payattitude',
    'mpesa',
    'ghmobilemoney',
  ])
  channel?: string;

  @IsOptional()
  @IsString()
  status: string;
}

export class VerifyPayinDto {
  @IsString() idOrTxRef: string; // Flutterwave tx id OR tx_ref
}
