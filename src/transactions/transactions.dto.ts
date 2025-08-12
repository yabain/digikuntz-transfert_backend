// src/transactions/dto/init-payment.dto.ts
export class InitPaymentDto {
  amount: number;
  currency?: string;
  customerEmail?: string;
  // + autres champs si besoin
}
