import { IsString, IsNumber, IsIn, IsOptional } from 'class-validator';

export type PayoutType = 'bank' | 'mobile_money' | 'wallet';

export class CreatePayoutDto {
  @IsIn(['bank', 'mobile_money', 'wallet'])
  type: PayoutType;

  @IsNumber()
  amount: number; // in destination currency

  @IsString()
  sourceCurrency: string; // e.g. XAF

  @IsString()
  destinationCurrency: string; // e.g. XAF

  @IsString()
  reference: string; // unique reference

  @IsOptional()
  @IsString()
  narration?: string;

  // BANK
  @IsOptional()
  @IsString()
  accountBankCode?: string; // bank code

  @IsOptional()
  @IsString()
  accountNumber?: string;
}
