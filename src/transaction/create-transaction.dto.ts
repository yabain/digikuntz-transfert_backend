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
  ReqStatus,
  TicketClassIdrate,
  TransactionType,
} from './transaction.schema';

export class CreateTransactionDto {
  @IsString()
  @IsEmpty()
  readonly invoiceRef: string;

  @IsNumber()
  @IsNotEmpty()
  readonly payment: number;

  @IsString()
  @IsNotEmpty()
  readonly paymentMethod: string;

  @IsString()
  @IsNotEmpty()
  readonly paymentMethodNumber: string;

  @IsString()
  @IsNotEmpty()
  readonly paymentWithTaxes: number; // as 'amount' in payment API req/re

  @IsEnum(ReqStatus, {
    message: 'Enter corect ReqStatus',
  })
  @IsNotEmpty()
  readonly reqStatus: ReqStatus; // as 'state' in payment API res

  @IsString()
  @IsNotEmpty()
  readonly taxes: number;

  @IsNumber()
  @IsNotEmpty()
  readonly taxesAmount: number;

  @IsNotEmpty()
  readonly tickets: TicketClassIdrate[];

  @IsEmpty({ message: 'You cannot pass user id' })
  readonly userId: User;

  @IsEmail()
  @IsNotEmpty()
  readonly userEmail: string;

  @IsString()
  @IsNotEmpty()
  readonly userName: string;

  @IsString()
  @IsNotEmpty()
  readonly userPhone: string;

  @IsEnum(TransactionType, {
    message: 'Enter corect TransactionType',
  })
  @IsNotEmpty()
  readonly type: TransactionType;

  @IsEnum(Currency, {
    message: 'Enter corect Currency',
  })
  @IsNotEmpty()
  readonly moneyCode: Currency; // as 'moneyCode' in payment API req/res

  @IsNotEmpty()
  readonly titled: string; // as 'raison' in payment API req/res

  @IsEnum(PaymentMethode, {
    message: 'Enter corect PaymentMethode',
  })
  @IsNotEmpty()
  readonly paymentMode: PaymentMethode; // In payment API req/res

  @IsOptional()
  readonly token: string; // In payment API res

  @IsNotEmpty()
  readonly ref: string; // In payment API res

  @IsOptional()
  readonly reqStatusCode: number; // statusCode in payment API res

  @IsOptional()
  readonly reqErrorCode: number; // data.error in payment API res

  @IsOptional()
  readonly message: string; // Deduced from the response code
}
