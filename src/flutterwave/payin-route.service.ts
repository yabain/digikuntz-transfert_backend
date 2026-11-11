/**
 * Aiguillage des encaissements — une seule implémentation, trois modes explicites.
 *
 * ── Pourquoi ce service existe ────────────────────────────────────────────────
 * Plusieurs voies d'encaissement coexistent, et elles doivent rester **séparées** :
 *
 * | Mode | Ce qui se passe | Route |
 * |---|---|---|
 * | **direct** | débit mobile money (`POST /charges?type=…`), aucune interface hébergée | `POST /fw/direct-charge` |
 * | **hébergé** | le prestataire fournit une URL d'interface (`redirect_url`) | `POST /fw/payin` |
 * | **natif CM** | débit Orange/MTN Cameroun via les API natives (persist-then-charge) | `POST /fw/payin` (même route, branchement en amont) |
 *
 * Avant, la décision entre les deux était **recopiée à l'identique** dans la
 * facture et la demande de paiement (« resolvePayinResult »), avec seulement quatre
 * divergences : mapping de champs, `userId`, `flow` et `meta`. Deux copies d'une
 * règle monétaire, c'est deux endroits où l'oublier.
 *
 * Ici : `payDirect`, `payHosted` et `payNativeCm` sont les points d'entrée de
 * chaque mode, et `resolve` est l'unique aiguillage utilisé par la facture, la
 * demande de paiement et le transfert. Les appelants ne gardent que leur
 * spécificité (mapping de champs, `flow`, `meta`, `gatewayType`).
 *
 * ── Les deux invariants monétaires ────────────────────────────────────────────
 * 1. **Une erreur ambiguë ne bascule JAMAIS vers l'hébergé.** Un timeout, un 5xx ou
 *    un socket coupé signifient que la charge a *peut-être* réussi : rejouer via
 *    une autre voie ferait payer deux fois. Seul un rejet **pré-charge** — prouvé
 *    comme antérieur à toute requête — autorise le repli.
 * 2. **Le repli est débrayable** (`DIRECT_CHARGE_FALLBACK_HOSTED=false`) pour
 *    pouvoir forcer un diagnostic, auquel cas l'erreur remonte telle quelle.
 *
 * ── Voie native Cameroun (PARALLÈLE) ──────────────────────────────────────────
 * Quand la `PaymentMethod` résolue pointe vers une passerelle `orange_cm`/
 * `mtn_cm` ET que `NATIVE_PAYIN_ENABLED=true`, `resolve` débite via le service
 * natif correspondant au lieu de Flutterwave — même invariants :
 *   - la vérification de l'opérateur du numéro (préfixes Orange/MTN Cameroun)
 *     est faite AVANT tout appel natif ; une incohérence est un rejet
 *     **pré-charge** (`NATIVE_OPERATOR_MISMATCH`), donc le repli hébergé
 *     historique continue de s'appliquer ;
 *   - un échec ambigu (5xx/timeout après l'envoi du débit) est relancé : le
 *     payin reste `pending` et le cron natif (`handleNativeCmCron`) le réconcilie.
 *
 * ── Portée volontaire ─────────────────────────────────────────────────────────
 * Ce service orchestre *quel mode appeler*. La mécanique du débit (persistance
 * persist-then-charge, construction du corps, enregistrement du résultat de
 * charge) reste dans les adaptateurs de passerelle (`FlutterwaveService`, et le
 * chemin natif persiste ici via `PayinService` pour rester dans l'aiguillage).
 * Le crédit d'un succès passe TOUJOURS par
 * `FlutterwaveService.processSuccessfulPayin` (claim atomique + clés uniques).
 */
import {
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import { FlutterwaveService } from './flutterwave.service';
import { isPreChargeRejection } from './mobile-money-charge.builder';
import { isHostedFallbackEnabled } from './direct-charge.config';
import { isNativePayinEnabled } from 'src/payment/native-payin.config';
import {
  MobileMoneyNetworkError,
  resolveMobileMoneyNetwork,
} from './mobile-money-network.util';
import { PayinService } from 'src/payin/payin.service';
import {
  Payin,
  PayinDocument,
  PayinProvider,
  PayinStatus,
} from 'src/payin/payin.schema';
import { TransactionService } from 'src/transaction/transaction.service';
import { OrangeCmService } from 'src/orange-cm/orange-cm.service';
import { MtnCmService } from 'src/mtn-cm/mtn-cm.service';
import { CryptService } from 'src/dev/crypt.service';
import { Gateway } from 'src/gateway/gateway.schema';

/** Flux d'encaissement qui passent par cet aiguillage. */
export type PayinFlow = 'invoice' | 'payment_request' | 'transfer';

/**
 * Résultat d'un encaissement, dans la forme commune des voies.
 *
 * Volontairement permissif : les voies ne renvoient pas les mêmes champs
 * (`redirect_url` pour l'hébergé, `chargeStatus` pour le direct et le natif) et
 * les appelants lisent `redirect_url || link || url`. La signature d'index évite
 * de forcer un type unique là où le contrat est réellement lâche.
 */
export interface PayinRouteResult {
  status?: string;
  /**
   * Voies hébergée/directe : le service renvoie le document `Transaction` créé,
   * pas son identifiant. Typé `unknown` plutôt que `any` pour rester honnête sur
   * le contrat réellement lâche de cette valeur.
   */
  transactionId?: unknown;
  txRef?: string;
  amount?: number;
  currency?: string;
  customerEmail?: string;
  /** Voie hébergée : URL d'interface fournie par le prestataire. */
  redirect_url?: string;
  /** Voies directe/native : statut brut renvoyé par la charge. */
  chargeStatus?: string;
  provider?: string;
  network?: string;
  message?: string;
  [key: string]: unknown;
}

/** Le payeur, tel que fourni par le flux appelant (noms de champs neutres). */
export interface PayinPayer {
  /** `mobile_money` → voie directe ou native. Tout le reste (dont `card`) → hébergé. */
  method?: 'mobile_money' | 'card';
  phone?: string;
  email?: string;
  name?: string;
  network?: string;
  /** ISO2 du payeur, utilisé pour résoudre un numéro sans indicatif. */
  country?: string;
  deviceFingerprint?: string;
  clientIp?: string;
  /**
   * Type de passerelle cible, renseigné par l'appelant quand la `PaymentMethod`
   * résolue pointe vers une passerelle native Cameroun. Sans cette valeur, la
   * voie native n'est JAMAIS tentée (comportement historique inchangé).
   */
  gatewayType?: 'orange_cm' | 'mtn_cm';
}

/** Ce que l'appelant sait de son propre flux. */
export interface PayinRouteContext {
  flow: PayinFlow;
  /** Identifiant de la transaction, attendu par la voie hébergée de la demande de paiement. */
  userId?: string;
  /** Données propres au flux, rattachées au payin (`meta`). */
  meta?: Record<string, unknown>;
  /** Email de repli quand le payeur n'en fournit pas (cas de la facture). */
  fallbackEmail?: string;
  /** Libellé du flux dans les journaux, pour identifier la source sans ambiguïté. */
  label: string;
}

/** Type de passerelle native Cameroun, tel qu'exposé par `PaymentMethod.gatewayId.type`. */
export type NativeCmGatewayType = 'orange_cm' | 'mtn_cm';

@Injectable()
export class PayinRouteService {
  private readonly logger = new Logger(PayinRouteService.name);

  constructor(
    private readonly flutterwaveService: FlutterwaveService,
    private readonly config: ConfigService,
    private readonly payinService: PayinService,
    // Même décorateur que `FlutterwaveService` : `TransactionService` est en
    // cycle réel (↔ FlutterwaveService), notre classe comme la sienne
    // appartiennent au même module — sans forwardRef, Nest reçoit `undefined`.
    @Inject(forwardRef(() => TransactionService))
    private readonly transactionService: TransactionService,
    private readonly orangeCmService: OrangeCmService,
    private readonly mtnCmService: MtnCmService,
    private readonly cryptService: CryptService,
    @InjectModel(Gateway.name) private readonly gatewayModel: mongoose.Model<Gateway>,
    @InjectModel(Payin.name) private readonly payinModel: mongoose.Model<PayinDocument>,
  ) {}

  /**
   * Voie **hébergée** : le prestataire fournit une URL d'interface à ouvrir.
   *
   * @param {any} transactionData - Données de transaction déjà construites.
   * @param {PayinRouteContext} context - Contexte du flux appelant.
   * @returns {Promise<PayinRouteResult>} - Résultat contenant `redirect_url`.
   */
  async payHosted(
    transactionData: any,
    context: PayinRouteContext,
  ): Promise<PayinRouteResult> {
    return this.flutterwaveService.createPayin(transactionData, context.userId);
  }

  /**
   * Voie **directe** : débit mobile money Flutterwave sans interface hébergée.
   *
   * Peut encore lever une erreur ; c'est `resolve` qui décide s'il faut replier.
   *
   * @param {any} transactionData - Données de transaction déjà construites.
   * @param {PayinPayer} payer - Coordonnées du payeur.
   * @param {PayinRouteContext} context - Contexte du flux appelant.
   * @returns {Promise<PayinRouteResult>} - Résultat contenant `chargeStatus`.
   */
  async payDirect(
    transactionData: any,
    payer: PayinPayer,
    context: PayinRouteContext,
  ): Promise<PayinRouteResult> {
    return this.flutterwaveService.createDirectPayin(transactionData, {
      // `?? ''` : la voie directe exige un numéro ; un numéro vide est refusé par
      // le constructeur de charge, qui produit un rejet **pré-charge** — donc un
      // repli vers l'hébergé, jamais une charge lancée avec un numéro vide.
      phone: payer.phone ?? '',
      email: payer.email || context.fallbackEmail || '',
      name: payer.name,
      network: payer.network,
      country: payer.country,
      clientIp: payer.clientIp,
      deviceFingerprint: payer.deviceFingerprint,
      flow: context.flow,
      meta: context.meta,
    });
  }

  /**
   * Aiguillage unique de la facture, de la demande de paiement et du transfert.
   *
   * Décide du mode (natif CM / direct / hébergé), et gère le repli vers
   * l'hébergé **uniquement** sur rejet pré-charge. Toute autre erreur est
   * relancée : c'est ce qui empêche un double débit (voir invariant 1 de
   * l'en-tête).
   *
   * Le chemin natif Cameroun est PARALLÈLE : il n'est tenté que lorsque le
   * payeur déclare une méthode pointant vers une passerelle `orange_cm`/`mtn_cm`
   * ET que `NATIVE_PAYIN_ENABLED=true`. Flag éteint → comportement historique
   * (voie directe Flutterwave) inchangé.
   *
   * @param {any} transactionData - Données de transaction déjà construites.
   * @param {PayinPayer} payer - Coordonnées du payeur et mode choisi.
   * @param {PayinRouteContext} context - Contexte du flux appelant.
   * @returns {Promise<PayinRouteResult>} - Le résultat du mode retenu.
   */
  async resolve(
    transactionData: any,
    payer: PayinPayer,
    context: PayinRouteContext,
  ): Promise<PayinRouteResult> {
    if (payer.method !== 'mobile_money') {
      return this.payHosted(transactionData, context);
    }

    try {
      if (this.isNativeGateway(payer.gatewayType)) {
        if (isNativePayinEnabled(this.config)) {
          return await this.payNativeCm(transactionData, payer, context);
        }
        // Flag éteint : la passerelle native est ignorée, on conserve le chemin
        // Flutterwave historique tel quel (levier de rollback).
      }

      return await this.payDirect(transactionData, payer, context);
    } catch (error: unknown) {
      if (!isPreChargeRejection(error)) {
        // Ambigu : la charge a peut-être abouti. Replier ici ferait payer deux
        // fois. Le payin reste `pending` et sera réconcilié par le cron natif /
        // direct selon la voie empruntée.
        throw error;
      }

      if (!isHostedFallbackEnabled(this.config)) {
        this.logger.warn(
          `${context.label}: direct mobile money charge not possible and hosted fallback is disabled`,
        );
        throw error;
      }

      this.logger.warn(
        `${context.label}: direct mobile money charge not possible (${this.reason(error)}) — falling back to the hosted checkout`,
      );
      return this.payHosted(transactionData, context);
    }
  }

  /**
   * Voie **native Cameroun** : débit Orange CM / MTN CM via les API natives.
   *
   * Persist-then-charge, calqué sur `FlutterwaveService.createDirectPayin` :
   *   1. vérification de l'opérateur du numéro AVANT tout appel ni écriture
   *      (rejet pré-charge → repli hébergé) ;
   *   2. résolution + déchiffrement des credentials de la passerelle native ;
   *   3. création de la `Transaction` (le montant débité = `paymentWithTaxes`) ;
   *   4. persistance du `Payin` `pending` (`provider` orange_cm/mtn_cm,
   *      `meta.flow: 'native_cm'`) — l'index unique `txRef` est la clé
   *      d'idempotence d'une requête retentée ;
   *   5. débit natif (Orange : token → `mp/init` → `meta.payToken` persisté
   *      AVANT `/pay` ; MTN : `xReferenceId` UUID v4 persisté AVANT
   *      `requesttopay`, jamais re-généré sur un payin `pending`).
   *
   * Un échec APRÈS l'envoi du débit (5xx/timeout) remonte : le payin reste
   * `pending` et `handleNativeCmCron` le réconcilie (jamais de repli ambigu).
   *
   * @param {any} transactionData - Données de transaction déjà construites.
   * @param {PayinPayer} payer - Coordonnées du payeur (doit porter `gatewayType`).
   * @param {PayinRouteContext} context - Contexte du flux appelant.
   * @returns {Promise<PayinRouteResult>} - Résultat contenant `chargeStatus`.
   */
  private async payNativeCm(
    transactionData: any,
    payer: PayinPayer,
    context: PayinRouteContext,
  ): Promise<PayinRouteResult> {
    const gatewayType = payer.gatewayType as NativeCmGatewayType;
    const currency = String(
      transactionData.senderCurrency ||
        transactionData.receiverCurrency ||
        'XAF',
    ).toUpperCase();
    const phone = String(payer.phone ?? '')
      .trim()
      .replace(/^00/, '');

    // 1. Opérateur du numéro, AVANT tout appel natif ni écriture : seule une
    // incohérence prouvée pré-charge peut replier vers l'hébergé.
    const resolved = this.resolveNativeOperator(phone, currency, payer);
    const expectedNetwork = gatewayType === 'orange_cm' ? 'ORANGEMONEY' : 'MTN';
    if (resolved.country !== 'CM' || resolved.network !== expectedNetwork) {
      throw new HttpException(
        {
          message: `The payer phone number does not belong to the ${gatewayType} gateway (${resolved.network} in ${resolved.country}).`,
          code: 'NATIVE_OPERATOR_MISMATCH',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const msisdn = resolved.msisdn;

    // 2. Credentials de la passerelle native — AVANT toute écriture, pour ne
    // jamais laisser une transaction ou un payin orphelin (même précondition
    // que le chemin direct).
    const gateway = await this.loadNativeGateway(
      gatewayType,
      currency,
      transactionData.gatewayId,
    );
    const creds = this.decryptGatewayCredentials(gateway);
    if (gatewayType === 'orange_cm') {
      this.orangeCmService.setCredentials(creds);
    } else {
      this.mtnCmService.setCredentials(creds);
    }

    // 3. Transaction (le montant réellement débité inclut les frais).
    const savedTransaction =
      await this.transactionService.createTransaction(transactionData);
    if (!savedTransaction) {
      throw new NotFoundException('Error to save transaction details');
    }
    // Même règle que `createDirectPayin` : on débite `paymentWithTaxes` (base +
    // taxes + commission) pour que le payeur règle exactement le total annoncé.
    // Repli sur `estimation` si la transaction n'a pas calculé de frais.
    const chargeAmount =
      Number(savedTransaction.paymentWithTaxes) || Number(transactionData.estimation);

    // 4. Payin `pending` persisté AVANT le débit (idempotence par `txRef`).
    const txRef = this.payinService.generateTxRef(
      gatewayType === 'orange_cm' ? 'txOm' : 'txMtn',
    );

    if (gatewayType === 'mtn_cm') {
      try {
        return await this.payNativeMtn({
          transactionData,
          payer,
          context,
          txRef,
          currency,
          chargeAmount,
          transactionId: savedTransaction._id,
          msisdn,
          gatewayId: String(gateway._id),
          expected: { resolverNetwork: resolved.network },
        });
      } catch (error) {
        return this.handleNativePreChargeFailure(error, {
          transactionData,
          payer,
          context,
          savedTransaction,
          txRef,
          currency,
        });
      }
    }

    try {
      return await this.payNativeOrange({
        transactionData,
        payer,
        context,
        txRef,
        currency,
        chargeAmount,
        transactionId: savedTransaction._id,
        msisdn,
        gatewayId: String(gateway._id),
      });
    } catch (error) {
      return this.handleNativePreChargeFailure(error, {
        transactionData,
        payer,
        context,
        savedTransaction,
        txRef,
        currency,
      });
    }
  }

  /**
   * Gère un échec du débit natif **après** la persistance de la transaction.
   *
   * Seul un rejet pré-charge (token OAuth / `mp/init` Orange, numéro incohérent)
   * autorise le repli : aucun `/pay` ni `requesttopay` n'est parti, donc aucune
   * somme n'est en vol. Une erreur ambiguë (5xx/timeout après l'envoi du débit)
   * est relancée telle quelle et laissée au cron de réconciliation.
   *
   * Le repli réutilise la MÊME transaction : la facture / la demande de paiement
   * continue de pointer sur elle, et le payin natif est clôturé `FAILED` pour ne
   * pas être réconcilié indéfiniment.
   */
  private async handleNativePreChargeFailure(
    error: unknown,
    params: {
      transactionData: any;
      payer: PayinPayer;
      context: PayinRouteContext;
      savedTransaction: any;
      txRef: string;
      currency: string;
    },
  ): Promise<PayinRouteResult> {
    if (!isPreChargeRejection(error) || !isHostedFallbackEnabled(this.config)) {
      throw error;
    }

    try {
      await this.payinService.markChargeTerminal(
        params.txRef,
        params.savedTransaction._id,
        PayinStatus.FAILED,
        {
          error: {
            source: params.payer.gatewayType,
            message: this.reason(error),
          },
        },
      );
    } catch {
      // Best-effort : ne jamais bloquer le repli pour un défaut d'écriture.
    }

    try {
      const hosted = await this.flutterwaveService.createHostedPayinForTransaction({
        transaction: params.savedTransaction,
        userId: params.context.userId,
        currency: params.currency,
        redirectUrl: params.transactionData?.redirectUrl,
        meta: {
          flow: 'hosted_fallback',
          directFlow: 'native_cm',
          directTxRef: params.txRef,
        },
      });

      // La transaction passe en checkout hébergé : on le consigne sur elle.
      try {
        await this.transactionService.markPayinModeHosted(
          String(params.savedTransaction._id),
          {
            from: 'native_cm',
            reason: 'NATIVE_PRE_CHARGE_FAILED',
            directTxRef: params.txRef,
          },
        );
      } catch (markError: unknown) {
        this.logger.warn(
          `${params.context.label}: could not record hosted fallback (${this.reason(markError)})`,
        );
      }

      this.logger.warn(
        `${params.context.label}: native charge not possible (${this.reason(error)}) — falling back to the hosted checkout`,
      );

      return {
        ...hosted,
        status: 'pending',
        chargeStatus: 'fallback_hosted',
        fallback: {
          from: 'native_cm',
          reason: 'NATIVE_PRE_CHARGE_FAILED',
          message:
            'The native mobile money charge could not start; a hosted checkout link was created instead.',
          directTxRef: params.txRef,
        },
        directCharge: {
          source: params.payer.gatewayType,
          message: this.reason(error),
        },
      };
    } catch (hostedError) {
      this.logger.error(
        `${params.context.label}: native charge failed and the hosted fallback also failed (${this.reason(hostedError)})`,
      );
      // Code hors liste pré-charge : `resolve` ne retentera pas un second
      // hébergé, qui créerait une transaction orpheline.
      throw new HttpException(
        {
          message:
            'The native mobile money charge failed and the hosted checkout fallback is unavailable.',
          code: 'NATIVE_FALLBACK_FAILED',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Débit natif MTN MoMo Cameroun (`requesttopay`, 202 = requête partie). */
  private async payNativeMtn(params: {
    transactionData: any;
    payer: PayinPayer;
    context: PayinRouteContext;
    txRef: string;
    currency: string;
    chargeAmount: number;
    transactionId: string | mongoose.Types.ObjectId;
    msisdn: string;
    gatewayId: string;
    expected: { resolverNetwork: string };
  }): Promise<PayinRouteResult> {
    const {
      transactionData,
      payer,
      context,
      txRef,
      currency,
      chargeAmount,
      transactionId,
      msisdn,
      gatewayId,
    } = params;

    const xReferenceId = this.mtnCmService.newXReferenceId();
    const payin = await this.persistNativePayin({
      txRef,
      amount: chargeAmount,
      currency,
      customerEmail: payer.email || context.fallbackEmail || '',
      customerName: payer.name,
      transactionId,
      context,
      provider: PayinProvider.MTN_CM,
      msisdn,
      gatewayId,
      extraMeta: { xReferenceId },
    });

    // Un payin `pending` existant porte déjà son propre `xReferenceId` : une
    // requête retentée ne doit JAMAIS re-générer/retenter le débit.
    const persistedRef = String(payin?.meta?.xReferenceId || '');
    if (persistedRef && persistedRef !== xReferenceId) {
      this.logger.warn(
        `${context.label}: MTN payin ${txRef} already in flight (xReferenceId ${persistedRef}) — not re-charging`,
      );
      return this.nativePendingResult(payin, context, transactionId);
    }

    await this.mtnCmService.requestToPay({
      partyId: msisdn,
      amount: chargeAmount,
      currency,
      externalId: txRef,
      payerMessage: `Paiement de ${chargeAmount} ${currency}`,
      payeeNote: `Paiement de ${chargeAmount} ${currency}`,
      xReferenceId,
    });

    return {
      status: 'pending',
      transactionId: String(transactionId),
      txRef,
      amount: chargeAmount,
      currency,
      provider: PayinProvider.MTN_CM,
      network: params.expected.resolverNetwork,
      chargeStatus: 'pending',
      redirect_url: '',
    };
  }

  /** Débit natif Orange Money Cameroun (token → `mp/init` → `mp/pay`). */
  private async payNativeOrange(params: {
    transactionData: any;
    payer: PayinPayer;
    context: PayinRouteContext;
    txRef: string;
    currency: string;
    chargeAmount: number;
    transactionId: string | mongoose.Types.ObjectId;
    msisdn: string;
    gatewayId: string;
  }): Promise<PayinRouteResult> {
    const {
      transactionData,
      payer,
      context,
      txRef,
      currency,
      chargeAmount,
      transactionId,
      msisdn,
      gatewayId,
    } = params;

    const payin = await this.persistNativePayin({
      txRef,
      amount: chargeAmount,
      currency,
      customerEmail: payer.email || context.fallbackEmail || '',
      customerName: payer.name,
      transactionId,
      context,
      provider: PayinProvider.ORANGE_CM,
      msisdn,
      gatewayId,
    });

    // Payin `pending` déjà en vol (payToken persisté) : ne JAMAIS re-débiter.
    if (payin?.meta?.payToken) {
      this.logger.warn(
        `${context.label}: Orange payin ${txRef} already in flight (payToken persisted) — not re-charging`,
      );
      return this.nativePendingResult(payin, context, transactionId);
    }

    // Token + `mp/init` : tant qu'ils échouent, AUCUN `/pay` n'est envoyé.
    // L'erreur est donc re-étiquetée « pré-charge » pour autoriser le repli
    // hébergé ; `payNativeCm` la convertit en checkout hébergé.
    let payToken: string;
    try {
      const token = await this.orangeCmService.getAccessToken();
      ({ payToken } = await this.orangeCmService.initPay(token));
    } catch (error) {
      throw new HttpException(
        {
          message: this.reason(error),
          code: 'NATIVE_PRE_CHARGE_FAILED',
          details:
            error instanceof HttpException ? error.getResponse() : undefined,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Persister le `payToken` AVANT `/pay` : si `/pay` timeout, le payin reste
    // réconciliable via `paymentstatus/{payToken}`.
    await this.payinModel.updateOne(
      { txRef, status: PayinStatus.PENDING },
      { $set: { 'meta.payToken': payToken } },
    );

    const notifUrl = `${(this.config.get<string>('BACK_URL') || '').replace(/\/+$/, '')}/orange-cm/notify`;
    const description = String(
      transactionData.raisonForTransfer || 'Orange Money Cameroun',
    );

    try {
      await this.orangeCmService.pay({
        payToken,
        subscriberMsisdn: msisdn,
        amount: chargeAmount,
        orderId: txRef,
        description,
        notifUrl,
      });
    } catch (error) {
      // Erreur ambiguë (5xx/timeout) : `pay` a pu partir → le payin reste
      // `pending` (payToken persisté) et le cron natif tranchera.
      if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.BAD_REQUEST) {
        this.logger.warn(
          `${context.label}: Orange pay ${txRef} outcome ambiguous (${this.reason(error)}) — leaving payin pending for reconciliation`,
        );
      }
      throw error;
    }

    return {
      status: 'pending',
      transactionId: String(transactionId),
      txRef,
      amount: chargeAmount,
      currency,
      provider: PayinProvider.ORANGE_CM,
      chargeStatus: 'pending',
      redirect_url: '',
    };
  }

  /** Persiste le payin natif `pending` (idempotent par `txRef` unique). */
  private async persistNativePayin(params: {
    txRef: string;
    amount: number;
    currency: string;
    customerEmail: string;
    customerName?: string;
    transactionId: string | mongoose.Types.ObjectId;
    context: PayinRouteContext;
    provider: PayinProvider;
    msisdn: string;
    gatewayId: string;
    extraMeta?: Record<string, unknown>;
  }): Promise<PayinDocument> {
    return this.payinService.createPendingPayin({
      txRef: params.txRef,
      amount: params.amount,
      currency: params.currency,
      customerEmail: params.customerEmail,
      customerName: params.customerName,
      transactionId: params.transactionId,
      channel: 'mobile_money',
      provider: params.provider,
      meta: {
        flow: 'native_cm',
        msisdn: params.msisdn,
        gatewayId: params.gatewayId,
        ...(params.context.meta ?? {}),
        ...(params.extraMeta ?? {}),
      },
    });
  }

  /** Résultat commun d'un payin natif déjà en vol (requête retentée). */
  private nativePendingResult(
    payin: PayinDocument | null,
    context: PayinRouteContext,
    transactionId: string | mongoose.Types.ObjectId,
  ): PayinRouteResult {
    return {
      status: payin?.status ?? 'pending',
      transactionId: String(transactionId),
      txRef: payin?.txRef,
      amount: payin?.amount,
      currency: payin?.currency,
      provider: payin?.provider,
      chargeStatus: 'pending',
      redirect_url: '',
    };
  }

  /**
   * Résout l'opérateur du numéro via `resolveMobileMoneyNetwork` (source unique
   * des tables de préfixes). Toute erreur du résolveur est un rejet **pré-charge**
   * (400 avec un code de `PRE_CHARGE_REJECTION_CODES`) : le repli hébergé peut
   * s'appliquer en toute sécurité car rien n'est parti.
   */
  private resolveNativeOperator(
    phone: string,
    currency: string,
    payer: PayinPayer,
  ): { network: string; country: string; msisdn: string } {
    try {
      const resolved = resolveMobileMoneyNetwork({
        phone,
        currency,
        country: payer.country,
        network: payer.network,
      });
      return {
        network: resolved.network,
        country: resolved.country,
        msisdn: resolved.msisdn,
      };
    } catch (error) {
      if (error instanceof MobileMoneyNetworkError) {
        throw new HttpException(
          { message: error.message, code: error.code, details: error.details },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }

  /** True when the payer method points to a native Cameroon gateway. */
  private isNativeGateway(
    gatewayType: unknown,
  ): gatewayType is NativeCmGatewayType {
    return gatewayType === 'orange_cm' || gatewayType === 'mtn_cm';
  }

  /** Charge la passerelle native (par id si fourni, sinon active par type/devise). */
  private async loadNativeGateway(
    gatewayType: NativeCmGatewayType,
    currency: string,
    gatewayId?: unknown,
  ): Promise<any> {
    const gateway = gatewayId
      ? await this.gatewayModel.findById(String(gatewayId)).exec()
      : await this.gatewayModel
          .findOne({ type: gatewayType, currency, isActive: true })
          .exec();
    if (!gateway) {
      throw new NotFoundException(
        `No active ${gatewayType} gateway found for ${currency}`,
      );
    }
    return gateway;
  }

  /** Déchiffre les credentials d'un document `Gateway` (échec → `{}`, comme ailleurs). */
  private decryptGatewayCredentials(gateway: any): Record<string, any> {
    try {
      return JSON.parse(
        this.cryptService.decryptWithPassphrase(gateway.credentials),
      );
    } catch {
      return {};
    }
  }

  /** Message d'erreur exploitable, sans coercition d'objet. */
  private reason(error: unknown): string {
    return error instanceof Error && error.message
      ? error.message
      : 'unknown error';
  }
}