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
  ReqStatus,
  TransactionType,
} from './transaction.schema';

export class UpdateTransactionDto {
  @IsString()
  @IsEmpty()
  readonly invoiceRef: string;

  @IsNumber()
  @IsOptional()
  readonly payment: number;

  @IsString()
  @IsOptional()
  readonly paymentMethod: string;

  @IsString()
  @IsOptional()
  readonly paymentMethodNumber: string;

  @IsString()
  @IsOptional()
  readonly paymentWithTaxes: number; // as 'amount' in payment API req/re

  @IsEnum(ReqStatus, {
    message: 'Enter corect ReqStatus',
  })
  @IsOptional()
  readonly reqStatus: ReqStatus; // as 'state' in payment API res

  @IsString()
  @IsOptional()
  readonly taxes: number;

  @IsNumber()
  @IsOptional()
  readonly taxesAmount: number;

  @IsOptional()
  readonly eventId: Event;

  @IsOptional()
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly userId: User;

  @IsEmail()
  @IsOptional()
  readonly userEmail: string;

  @IsString()
  @IsOptional()
  readonly userName: string;

  @IsString()
  @IsOptional()
  readonly userPhone: string;

  @IsEnum(TransactionType, {
    message: 'Enter corect TransactionType',
  })
  @IsOptional()
  readonly type: TransactionType;

  @IsEnum(Currency, {
    message: 'Enter corect Currency',
  })
  @IsOptional()
  readonly moneyCode: Currency; // as 'moneyCode' in payment API req/res

  @IsOptional()
  readonly titled: string; // as 'raison' in payment API req/res

  @IsEnum(PaymentMethode, {
    message: 'Enter corect PaymentMethode',
  })
  @IsOptional()
  readonly paymentMode: PaymentMethode; // In payment API req/res

  @IsOptional()
  readonly token: string; // In payment API res

  @IsOptional()
  readonly ref: string; // In payment API res

  @IsOptional()
  readonly reqStatusCode: number; // statusCode in payment API res

  @IsOptional()
  readonly reqErrorCode: number; // data.error in payment API res

  @IsOptional()
  readonly message: string; // Deduced from the response code
}
