import {
  IsString,
  IsEmail,
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

export class UpdateTransactionDto {
  @IsString()
  @IsOptional()
  invoiceRef: string;

  @IsString()
  @IsOptional()
  txRef: string;

  @IsNumber()
  @IsOptional()
  payment: number;

  @IsString()
  @IsOptional()
  paymentMethod: string;

  @IsString()
  @IsOptional()
  paymentMethodNumber: string;

  @IsString()
  @IsOptional()
  transactionRef: string;

  @IsString()
  @IsOptional()
  paymentWithTaxes: number; // as 'amount' in payment API req/re

  @IsEnum(TStatus, {
    message: 'Enter corect status',
  })
  @IsOptional()
  status: TStatus; // as 'state' in payment API res

  @IsString()
  @IsOptional()
  taxes: number;

  @IsNumber()
  @IsOptional()
  taxesAmount: number;

  @IsOptional()
  eventId: Event;

  @IsOptional()
  userId: User;

  @IsEmail()
  @IsOptional()
  userEmail: string;

  @IsString()
  @IsOptional()
  userName: string;

  @IsOptional()
  raw: any;

  @IsString()
  @IsOptional()
  userPhone: string;

  @IsEnum(TransactionType, {
    message: 'Enter corect TransactionType',
  })
  @IsOptional()
  transactionType: TransactionType;

  @IsEnum(Currency, {
    message: 'Enter corect Currency',
  })
  @IsOptional()
  moneyCode: Currency; // as 'moneyCode' in payment API req/res

  @IsOptional()
  titled: string; // as 'raison' in payment API req/res

  @IsEnum(PaymentMethode, {
    message: 'Enter corect PaymentMethode',
  })
  @IsOptional()
  paymentMode: PaymentMethode; // In payment API req/res

  @IsOptional()
  token: string; // In payment API res

  @IsOptional()
  ref: string; // In payment API res

  @IsOptional()
  reqStatusCode: number; // statusCode in payment API res

  @IsOptional()
  reqErrorCode: number; // data.error in payment API res

  @IsOptional()
  message: string; // Deduced from the response code
}
