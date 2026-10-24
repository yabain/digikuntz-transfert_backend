import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDonationDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsBoolean()
  visibility?: boolean;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @IsOptional()
  @IsString()
  message?: string;

  /**
   * Code de la méthode de paiement choisie (`MTN_MOMO_XAF`, `Card`, ...).
   * Détermine le taux de frais appliqué : `taxesPayment` de cette méthode.
   */
  @IsOptional()
  @IsString()
  paymentMethodCode?: string;
}
