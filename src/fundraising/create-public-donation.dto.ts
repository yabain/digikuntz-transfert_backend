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

  /**
   * Code de la méthode de paiement choisie (`MTN_MOMO_XAF`, `Card`, ...).
   * Détermine le taux de frais appliqué : `taxesPayment` de cette méthode.
   */
  @IsOptional()
  @IsString()
  paymentMethodCode?: string;
}
