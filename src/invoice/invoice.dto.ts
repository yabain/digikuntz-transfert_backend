import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from './invoice.schema';

export class InvoiceItemDto {
  @IsString()
  @IsNotEmpty()
  designation: string;

  @Min(0)
  unitPrice: number;

  @Min(1)
  quantity: number;

  @Min(0)
  totalPrice: number;
}

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(['customer', 'organization'])
  commissionPayer?: 'customer' | 'organization';
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['customer', 'organization'])
  commissionPayer?: 'customer' | 'organization';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}

export class MarkInvoicePaidDto {
  @IsString()
  @IsNotEmpty()
  payerName: string;

  @IsString()
  @IsNotEmpty()
  payerPhone: string;

  @IsOptional()
  @IsString()
  payerEmail?: string;
}

export class InitiateInvoicePaymentDto {
  @IsString()
  @IsNotEmpty()
  payerName: string;

  /**
   * Coordonnée du payeur. Requise pour un débit mobile money (le numéro
   * identifie l'opérateur et le compte à débiter), mais facultative pour le
   * paiement par carte (checkout hébergé) où le payeur ne saisit ses
   * coordonnées que sur la page du provider.
   */
  @IsOptional()
  @IsString()
  payerPhone?: string;

  @IsOptional()
  @IsString()
  payerEmail?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string;

  /**
   * Payment route chosen by the payer.
   *
   * - `mobile_money`: direct charge — the payer approves a USSD / app push on
   *   their phone, no checkout link is opened;
   * - `card`: reserved for the upcoming card integration (falls back to the
   *   hosted checkout for now).
   *
   * Omitted entirely → the historical hosted-checkout behaviour, unchanged.
   */
  @IsOptional()
  @IsIn(['mobile_money', 'card'])
  paymentMethod?: 'mobile_money' | 'card';

  /**
   * Code de la méthode de paiement choisie (`MTN_MOMO_XAF`, `Card`, ...).
   *
   * Sert à dériver les frais : le paiement d'une facture utilise le
   * `taxesPayment` de cette méthode (repli sur `invoiceTaxes` système si la
   * méthode est absente). Le taux n'est jamais repris du corps : il est
   * re-résolu côté serveur depuis ce code.
   */
  @IsOptional()
  @IsString()
  paymentMethodCode?: string;

  /**
   * Optional operator override (`MTN`, `ORANGEMONEY`, `AIRTEL`, ...).
   *
   * Normally omitted: the operator is derived from the payer's phone number. It
   * is only honoured when the prefix cannot be resolved, which lets the UI offer
   * an explicit operator picker without ever contradicting a clear number.
   */
  @IsOptional()
  @IsString()
  network?: string;

  /** Opaque device identifier forwarded to Flutterwave for fraud scoring. */
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
