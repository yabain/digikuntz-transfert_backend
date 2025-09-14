import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsEmpty,
  IsNumber,
} from 'class-validator';
import { User } from 'src/user/user.schema';
import {
  Currency,
  PaymentMethode,
  TStatus,
  TransactionType,
} from './transaction.schema';

export class CreateTransactionDto {
  @IsString()
  @IsEmpty()
  invoiceRef: string;

  @IsNumber()
  @IsNotEmpty()
  payment: number;

  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @IsString()
  @IsNotEmpty()
  paymentMethodNumber: string;

  @IsString()
  @IsNotEmpty()
  paymentWithTaxes: number; // as 'amount' in payment API req/re

  @IsEnum(TStatus, {
    message: 'Enter corect status',
  })
  @IsNotEmpty()
  status: TStatus; // as 'state' in payment API res

  @IsString()
  @IsNotEmpty()
  taxes: number;

  @IsNumber()
  @IsNotEmpty()
  taxesAmount: number;

  @IsOptional()
  userId: User;

  @IsEmail()
  @IsNotEmpty()
  userEmail: string;

  @IsString()
  @IsNotEmpty()
  userName: string;

  @IsString()
  @IsNotEmpty()
  userPhone: string;

  @IsEnum(TransactionType, {
    message: 'Enter corect TransactionType',
  })
  @IsNotEmpty()
  transactionType: TransactionType;

  @IsEnum(Currency, {
    message: 'Enter corect Currency',
  })
  @IsNotEmpty()
  moneyCode: Currency; // as 'moneyCode' in payment API req/res

  @IsNotEmpty()
  titled: string; // as 'raison' in payment API req/res

  @IsEnum(PaymentMethode, {
    message: 'Enter corect PaymentMethode',
  })
  @IsNotEmpty()
  paymentMode: PaymentMethode; // In payment API req/res

  @IsOptional()
  token: string;

  @IsNotEmpty()
  ref: string;

  @IsOptional()
  reqStatusCode: number;

  @IsOptional()
  reqErrorCode: number; // data.error in payment API res

  @IsOptional()
  message: string; // Deduced from the response code
}
