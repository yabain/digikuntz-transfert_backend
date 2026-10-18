import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GatewayType = 'flutterwave' | 'paystack' | 'mpesa';

/**
 * Devises qu'une passerelle peut encaisser.
 *
 * Source unique : le schéma Mongoose, le DTO de création/mise à jour et le
 * formulaire d'administration s'y réfèrent au lieu de répéter la liste. Trois
 * copies divergentes étaient un risque de dérive — `XOF` manquait dans deux
 * d'entre elles alors que tout le chemin de charge directe le supporte déjà
 * (`DIRECT_CHARGE_CURRENCIES`, `mobile_money_franco` pour SN/CI/BF/ML).
 *
 * Ajouter une devise ici ne suffit PAS à l'exploiter : il faut aussi un document
 * `Gateway` actif pour cette devise, sinon la résolution des credentials échoue
 * explicitement (`No gateway found for currency "..."`).
 */
export const GATEWAY_CURRENCIES = ['XAF', 'XOF', 'NGN', 'KES'] as const;

export type GatewayCurrency = (typeof GATEWAY_CURRENCIES)[number];

export interface MpesaSubAccountBalance {
  currentBalance: number;
  availableBalance: number;
  reservedBalance: number;
  unclearedBalance: number;
  currency: string;
}

export interface MpesaBalances {
  workingAccount?: MpesaSubAccountBalance;
  utilityAccount?: MpesaSubAccountBalance;
  merchantAccount?: MpesaSubAccountBalance;
}

@Schema({ timestamps: true })
export class Gateway extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ default: '' })
  imageUrl: string;

  @Prop({ required: true, enum: ['flutterwave', 'paystack', 'mpesa'] })
  type: GatewayType;

  @Prop({ required: true, enum: [...GATEWAY_CURRENCIES] })
  currency: string;

  @Prop({ required: true })
  credentials: string;

  @Prop({ default: true })
  isActive: boolean;

  /** Commission (%) prélevée par le provider gateway (Flutterwave, Paystack, M-Pesa)
   *  sur chaque transaction réussie. Utilisée lors du crédit du solde système. */
  @Prop({ default: 0 })
  providerCommission: number;

  @Prop({ type: Object, default: {} })
  balance: Record<string, any>;
}

export const GatewaySchema = SchemaFactory.createForClass(Gateway);
