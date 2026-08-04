import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SystemBalanceMovementType = 'in' | 'out';

@Schema({ timestamps: true, collection: 'system_balance_movements' })
export class SystemBalanceMovement extends Document {
  /** Unique idempotency key, e.g. `system-fees-credit:<transactionId>` */
  @Prop({ required: true, unique: true })
  key: string;

  /** Sens du mouvement : `in` (encaissement/crédit) ou `out` (débit/paiement) */
  @Prop({ required: true, enum: ['in', 'out'] })
  type: SystemBalanceMovementType;

  /**
   * Statut en temps réel du mouvement, synchronisé avec la transaction liée :
   * - `pending`   : payin créé, paiement en attente
   * - `completed` : solde crédité/débité (terminal pour le solde)
   * - `failed`    : paiement échoué (transaction `PAYINERROR`)
   * - `cancelled` : paiement annulé (transaction `PAYINCLOSED`)
   */
  @Prop({
    required: true,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed',
  })
  status: string;

  /** Montant net crédité (+) ou débité (−) sur le solde système */
  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, uppercase: true })
  currency: string;

  /** Transaction liée (payin/payout) à l'origine du mouvement */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Transaction', default: null })
  transactionId?: string;

  /** Référence liée (txRef d'un payin, reference d'un payout, note admin...) */
  @Prop({ default: '' })
  reference?: string;

  /** Description libre du mouvement */
  @Prop({ default: '' })
  description?: string;

  /** Montant total encaissé chez le provider (in) ou payé (out) */
  @Prop({ default: 0 })
  amountCollected?: number;

  /** Frais facturés (markup, ex. invoiceTaxes) */
  @Prop({ default: 0 })
  gatewayFee?: number;

  /** Commission prélevée par le provider gateway */
  @Prop({ default: 0 })
  providerCommission?: number;

  /** Montant net crédité au solde système */
  @Prop({ default: 0 })
  amountCredited?: number;

  /** Admin / utilisateur responsable du mouvement */
  @Prop({
    type: {
      userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
      name: { type: String, default: '' },
      email: { type: String, default: '' },
    },
    default: null,
  })
  performedBy?: { userId?: string; name?: string; email?: string };
}

export const SystemBalanceMovementSchema = SchemaFactory.createForClass(
  SystemBalanceMovement,
);

SystemBalanceMovementSchema.index({ currency: 1, createdAt: -1 });
SystemBalanceMovementSchema.index({ transactionId: 1 });
SystemBalanceMovementSchema.index({ 'performedBy.userId': 1 });
