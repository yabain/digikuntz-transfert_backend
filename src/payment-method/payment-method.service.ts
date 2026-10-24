import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { CreatePaymentMethodDto } from './create-payment-method.dto';
import { UpdatePaymentMethodDto } from './update-payment-method.dto';
import { PaymentMethod } from './payment-method.schema';

@Injectable()
export class PaymentMethodService {
  /**
   * Champs de passerelle sûrs à exposer publiquement.
   *
   * `/payment-methods` est un endpoint public (le formulaire de paiement d'une
   * facture doit lister les méthodes actives sans authentification). Le
   * `populate('gatewayId')` renvoyait le document complet, `credentials`
   * compris — donc le secret Flutterwave chiffré et le hash de webhook. On ne
   * sélectionne plus que les champs nécessaires à l'affichage.
   */
  private static readonly PUBLIC_GATEWAY_FIELDS =
    'name description imageUrl type currency isActive providerCommission';

  private readonly gatewayPopulate = {
    path: 'gatewayId',
    select: PaymentMethodService.PUBLIC_GATEWAY_FIELDS,
  };

  constructor(
    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: mongoose.Model<PaymentMethod>,
  ) {}

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    // `0` signifie « pas de borne ». La comparaison n'a donc de sens que
    // lorsque les deux limites sont réellement définies.
    if (
      dto.minAmount !== undefined &&
      dto.maxAmount !== undefined &&
      Number(dto.minAmount) > 0 &&
      Number(dto.maxAmount) > 0 &&
      Number(dto.minAmount) > Number(dto.maxAmount)
    ) {
      throw new BadRequestException(
        'minAmount cannot be greater than maxAmount when both limits are set',
      );
    }
    return this.paymentMethodModel.create(dto);
  }

  async findAll(query: Query): Promise<PaymentMethod[]> {
    // Endpoint public : on borne la taille de page pour qu'un `?limit=100000`
    // ne puisse pas forcer une lecture de collection entière en une requête.
    const requested = Number((query as any)?.limit);
    const resPerPage =
      Number.isFinite(requested) && requested > 0
        ? Math.min(requested, 200)
        : 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          name: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};

    const countryId = String((query as any)?.countryId || '').trim();
    const provider = String((query as any)?.provider || '').trim();
    const filter: any = { ...keyword };
    if (countryId) filter.countryId = countryId;
    if (provider) filter.provider = provider;

    return this.paymentMethodModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(resPerPage)
      .skip(skip)
      .populate('countryId')
      .populate(this.gatewayPopulate);
  }

  async findById(id: string): Promise<PaymentMethod> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid payment method ID');
    }
    const paymentMethod = await this.paymentMethodModel
      .findById(id)
      .populate('countryId')
      .populate(this.gatewayPopulate);
    if (!paymentMethod) {
      throw new NotFoundException('Payment method not found');
    }
    return paymentMethod;
  }

  async findByCountryAndProvider(
    countryId: string,
    provider: string,
  ): Promise<PaymentMethod[]> {
    return this.paymentMethodModel
      .find({ countryId, provider })
      .sort({ name: 1 })
      .populate('countryId')
      .populate(this.gatewayPopulate);
  }

  async findByCountry(
    countryId: string,
  ): Promise<PaymentMethod[]> {
    return this.paymentMethodModel
      .find({ countryId })
      .sort({ name: 1 })
      .populate('countryId')
      .populate(this.gatewayPopulate);
  }

  /**
   * Méthodes actives d'encaissement pour une devise.
   *
   * Utilisé par le récapitulatif de transfert : la liste est filtrée côté
   * serveur (devise + `statusPayin`) pour ne pas dépendre de la pagination de
   * `GET /payment-methods`, qui plafonne à 200 documents et tronquerait
   * silencieusement la liste.
   *
   * @param {string} currency - Devise ISO (XAF, XOF, ...).
   * @returns {Promise<PaymentMethod[]>} - Méthodes actives, triées par nom.
   */
  async findActivePayinByCurrency(currency: string): Promise<PaymentMethod[]> {
    const normalized = String(currency || '').trim().toUpperCase();
    // Devise ISO uniquement : évite qu'une valeur arbitraire (ou une expression
    // régulière) soit injectée dans le filtre ci-dessous.
    if (!/^[A-Z]{3}$/.test(normalized)) return [];
    return this.paymentMethodModel
      .find({
        currency: { $regex: `^${normalized}$`, $options: 'i' },
        statusPayin: true,
      })
      .sort({ name: 1 })
      .populate('countryId')
      .populate(this.gatewayPopulate);
  }

  async findByCode(code: string): Promise<PaymentMethod | null> {
    return this.paymentMethodModel
      .findOne({ code })
      .populate('countryId')
      .populate(this.gatewayPopulate);
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethod> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid payment method ID');
    }
    if (
      dto.minAmount !== undefined &&
      dto.maxAmount !== undefined &&
      Number(dto.minAmount) > 0 &&
      Number(dto.maxAmount) > 0 &&
      Number(dto.minAmount) > Number(dto.maxAmount)
    ) {
      throw new BadRequestException(
        'minAmount cannot be greater than maxAmount when both limits are set',
      );
    }

    const updated = await this.paymentMethodModel.findByIdAndUpdate(id, dto, {
      new: true,
      runValidators: true,
    }).populate(this.gatewayPopulate);
    if (!updated) {
      throw new NotFoundException('Payment method not found');
    }
    return updated;
  }

  /**
   * Filtre un corps de requête non typé et y pose le taux de frais serveur
   * dérivé de la méthode de paiement identifiée.
   *
   * Règle : `taxesPayment` pour un encaissement hors transfert (facture,
   * prestation, don, abonnement) ; `taxesTransfer` dès que
   * `transactionType === 'transfer'` (y compris via l'endpoint payin), ou pour
   * un flux `payout`. Pour un transfert, le taux est porté par la méthode du
   * PAYEUR (`payerPaymentMethodCode`) ; la méthode de réception
   * (`paymentMethod`) ne sert que de repli (transfert depuis le solde).
   * Tout taux fourni par le client (`taxRateOverride`/`invoiceTaxes`) est
   * d'abord supprimé — sans quoi un payeur pourrait annuler ses propres frais
   * via un body non validé.
   *
   * @param {any} body - Corps de requête brut.
   * @param {'payin'|'payout'} direction - Sens du flux.
   * @returns {Promise<any>} - Copie assainie, avec `taxRateOverride` si résolu.
   */
  async resolveTaxOverride(
    body: any,
    direction: 'payin' | 'payout',
  ): Promise<any> {
    const data = { ...(body || {}) };
    delete data.taxRateOverride;
    delete data.invoiceTaxes;

    // Un transfert (`transactionType: transfer`) utilise `taxesTransfer`, même
    // lorsqu'il transite par l'endpoint payin. La méthode qui porte ce taux est
    // celle du PAYEUR (encaissement mobile money / carte), pas celle du
    // bénéficiaire : `paymentMethod` reste la méthode de réception (payout),
    // consommée plus tard par le payout. `payerPaymentMethodCode` est donc
    // prioritaire pour un transfert ; `paymentMethod` reste le repli historique
    // (transfert depuis le solde, où il n'y a pas de méthode payeur).
    const isTransfer =
      direction === 'payout' ||
      String(data.transactionType || '').toLowerCase() === 'transfer';
    const payerCode = String(data.payerPaymentMethodCode || '').trim();
    const legacyCode = String(
      data.paymentMethodCode || data.paymentMethod || data.bankCode || '',
    ).trim();
    const usesPayerMethod = isTransfer && payerCode.length > 0;
    const code = usesPayerMethod ? payerCode : legacyCode;
    if (!code) return data;

    const method = await this.findByCode(code.toUpperCase());
    if (!method) {
      // Une méthode explicitement choisie par le client doit être connue : la
      // laisser passer appliquerait silencieusement le taux système, donc un
      // montant différent de celui affiché dans le récapitulatif.
      if (usesPayerMethod) {
        throw new BadRequestException(`Payment method '${code.toUpperCase()}' not found`);
      }
      return data;
    }

    const currency = String(
      data.currency || data.senderCurrency || data.receiverCurrency || '',
    ).toUpperCase();
    if (currency && String(method.currency).toUpperCase() !== currency) {
      throw new BadRequestException(
        `Currency mismatch: method '${method.code}' is for ${method.currency}, not ${currency}`,
      );
    }

    // Un transfert porte DEUX méthodes : celle du payeur (qui donne le taux) et
    // celle du bénéficiaire (destination du payout, `paymentMethod`). La seconde
    // ne porte pas le taux mais doit rester une méthode de payout valide, sinon
    // un client pourrait enregistrer une destination impossible (ex. CARD).
    // Si le code n'est pas une méthode connue (ex. jeton opérateur `MTN`), on
    // laisse le service de payout faire son propre contrôle.
    if (usesPayerMethod && legacyCode) {
      const payoutMethod = await this.findByCode(legacyCode.toUpperCase());
      if (payoutMethod) {
        if (
          currency &&
          String(payoutMethod.currency).toUpperCase() !== currency
        ) {
          throw new BadRequestException(
            `Currency mismatch: payout method '${payoutMethod.code}' is for ${payoutMethod.currency}, not ${currency}`,
          );
        }
        if (!payoutMethod.statusPayout) {
          throw new BadRequestException(
            `Payment method '${payoutMethod.code}' is not available for payout`,
          );
        }
      }
    }

    if (usesPayerMethod) {
      // Côté payeur, la méthode sert à ENCAISSER : `statusPayin` est le bon
      // indicateur, `statusPayout` ne décrit que la réception.
      if (!method.statusPayin) {
        throw new BadRequestException(
          `Payment method '${method.code}' is not available for payin`,
        );
      }
      const amount = Number(data.estimation);
      if (Number.isFinite(amount)) {
        if (method.minAmount > 0 && amount < method.minAmount) {
          throw new BadRequestException(
            `Amount ${amount} is below minimum ${method.minAmount} for method '${method.code}'`,
          );
        }
        if (method.maxAmount > 0 && amount > method.maxAmount) {
          throw new BadRequestException(
            `Amount ${amount} exceeds maximum ${method.maxAmount} for method '${method.code}'`,
          );
        }
      }
    } else if (isTransfer) {
      if (!method.statusPayout) {
        throw new BadRequestException(
          `Payment method '${method.code}' is not available for payout`,
        );
      }
    } else if (direction === 'payin' && !method.statusPayin) {
      throw new BadRequestException(
        `Payment method '${method.code}' is not available for payin`,
      );
    }

    const rate = Number(isTransfer ? method.taxesTransfer : method.taxesPayment);
    if (Number.isFinite(rate) && rate >= 0) {
      data.taxRateOverride = rate;
    }
    return data;
  }

  async remove(id: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid payment method ID');
    }
    const deleted = await this.paymentMethodModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('Payment method not found');
    }
    return deleted;
  }
}
