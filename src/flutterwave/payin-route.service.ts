/**
 * Aiguillage des encaissements — une seule implémentation, deux modes explicites.
 *
 * ── Pourquoi ce service existe ────────────────────────────────────────────────
 * Deux voies d'encaissement coexistent, et elles doivent rester **séparées** :
 *
 * | Mode | Ce qui se passe | Route |
 * |---|---|---|
 * | **direct** | débit mobile money (`POST /charges?type=…`), aucune interface hébergée | `POST /fw/direct-charge` |
 * | **hébergé** | le prestataire fournit une URL d'interface (`redirect_url`) | `POST /fw/payin` |
 *
 * Avant, la décision entre les deux était **recopiée à l'identique** dans la
 * facture et la demande de paiement (« resolvePayinResult »), avec seulement quatre
 * divergences : mapping de champs, `userId`, `flow` et `meta`. Deux copies d'une
 * règle monétaire, c'est deux endroits où l'oublier.
 *
 * Ici : `payDirect` et `payHosted` sont les deux points d'entrée de chaque mode, et
 * `resolve` est l'unique aiguillage utilisé par la facture et la demande de
 * paiement. Les appelants ne gardent que leur spécificité (mapping de champs,
 * `flow`, `meta`).
 *
 * ── Les deux invariants monétaires ────────────────────────────────────────────
 * 1. **Une erreur ambiguë ne bascule JAMAIS vers l'hébergé.** Un timeout, un 5xx ou
 *    un socket coupé signifient que la charge a *peut-être* réussi : rejouer via
 *    une autre voie ferait payer deux fois. Seul un rejet **pré-charge** — prouvé
 *    comme antérieur à toute requête — autorise le repli.
 * 2. **Le repli est débrayable** (`DIRECT_CHARGE_FALLBACK_HOSTED=false`) pour
 *    pouvoir forcer un diagnostic, auquel cas l'erreur remonte telle quelle.
 *
 * ── Portée volontaire ─────────────────────────────────────────────────────────
 * Ce service orchestre *quel mode appeler*. La mécanique du débit (persistance
 * persist-then-charge, construction du corps, enregistrement du résultat de
 * charge) reste dans l'adaptateur de la passerelle, `FlutterwaveService`, où elle
 * est partagée avec le webhook et les crons de réconciliation
 * (`processSuccessfulPayin` notamment). Déplacer cette mécanique est un
 * changement distinct, à faire avec l'application démarrable : une erreur
 * d'injection de dépendance n'est visible ni à la compilation ni dans les tests
 * unitaires, seulement au démarrage.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlutterwaveService } from './flutterwave.service';
import { isPreChargeRejection } from './mobile-money-charge.builder';
import { isHostedFallbackEnabled } from './direct-charge.config';

/** Flux d'encaissement qui passent par cet aiguillage. */
export type PayinFlow = 'invoice' | 'payment_request' | 'transfer';

/**
 * Résultat d'un encaissement, dans la forme commune des deux voies.
 *
 * Volontairement permissif : les deux voies ne renvoient pas les mêmes champs
 * (`redirect_url` pour l'hébergé, `chargeStatus` pour le direct) et les appelants
 * lisent `redirect_url || link || url`. La signature d'index évite de forcer un
 * type unique là où le contrat est réellement lâche.
 */
export interface PayinRouteResult {
  status?: string;
  /**
   * Voie hébergée : le service renvoie le document `Transaction` créé, pas son
   * identifiant. Typé `unknown` plutôt que `any` pour rester honnête sur le
   * contrat réellement lâche de cette valeur.
   */
  transactionId?: unknown;
  txRef?: string;
  amount?: number;
  currency?: string;
  customerEmail?: string;
  /** Voie hébergée : URL d'interface fournie par le prestataire. */
  redirect_url?: string;
  /** Voie directe : statut brut renvoyé par la charge. */
  chargeStatus?: string;
  provider?: string;
  network?: string;
  message?: string;
  [key: string]: unknown;
}

/** Le payeur, tel que fourni par le flux appelant (noms de champs neutres). */
export interface PayinPayer {
  /** `mobile_money` → voie directe. Tout le reste (dont `card`) → hébergé. */
  method?: 'mobile_money' | 'card';
  phone?: string;
  email?: string;
  name?: string;
  network?: string;
  /** ISO2 du payeur, utilisé pour résoudre un numéro sans indicatif. */
  country?: string;
  deviceFingerprint?: string;
  clientIp?: string;
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

@Injectable()
export class PayinRouteService {
  private readonly logger = new Logger(PayinRouteService.name);

  constructor(
    private readonly flutterwaveService: FlutterwaveService,
    private readonly config: ConfigService,
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
   * Voie **directe** : débit mobile money sans interface hébergée.
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
   * Aiguillage unique de la facture et de la demande de paiement.
   *
   * Décide du mode, et gère le repli vers l'hébergé **uniquement** sur rejet
   * pré-charge. Toute autre erreur est relancée : c'est ce qui empêche un double
   * débit (voir invariant 1 de l'en-tête).
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
      return await this.payDirect(transactionData, payer, context);
    } catch (error: unknown) {
      if (!isPreChargeRejection(error)) {
        // Ambigu : la charge a peut-être abouti. Replier ici ferait payer deux
        // fois. Le payin reste `pending` et sera réconcilié par `tx_ref`.
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

  /** Message d'erreur exploitable, sans coercition d'objet. */
  private reason(error: unknown): string {
    return error instanceof Error && error.message
      ? error.message
      : 'unknown error';
  }
}
