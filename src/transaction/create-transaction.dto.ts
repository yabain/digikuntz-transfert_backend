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
import { Service } from 'src/service/service.schema';

export class CreateTransactionDto {
  @IsString()
  @IsEmpty()
  transactionRef: string;

  @IsString()
  @IsOptional()
  txRef: string;

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

  @IsOptional()
  receiverCountryCode: string;

  @IsNumber()
  @IsNotEmpty()
  taxesAmount: number;

  @IsOptional()
  userId: User;

  @IsOptional()
  serviceId: Service;

  @IsEmail()
  @IsNotEmpty()
  userEmail: string;

  @IsString()
  @IsNotEmpty()
  userName: string;

  @IsString()
  @IsOptional()
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

  @IsOptional()
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
