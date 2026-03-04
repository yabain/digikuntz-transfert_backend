import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDonationDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsBoolean()
  visibility?: boolean;

  @IsOptional()
  @IsString()
  message?: string;
}
