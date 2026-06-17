import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePublicDonationDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  donorName?: string;

  @IsOptional()
  @IsString()
  donorEmail?: string;
}
