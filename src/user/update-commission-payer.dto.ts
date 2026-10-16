/* eslint-disable prettier/prettier */
import { IsOptional, IsEnum } from 'class-validator';

export class UpdateCommissionPayerDto {
  @IsOptional()
  @IsEnum(['customer', 'organization'])
  commissionPayer?: 'customer' | 'organization';
}