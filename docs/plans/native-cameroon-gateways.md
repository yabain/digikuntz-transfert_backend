# Plan: Passerelles natives « Orange CM » et « MTN CM » (encaissement mobile money Cameroun)

## Context

- Ground truth (backends) — tous lus in extenso :
  - `digikuntz-transfert_backend/src/gateway/gateway.schema.ts`, `create-gateway.dto.ts`, `update-gateway.dto.ts`, `gateway.service.ts`, `gateway.controller.ts`
  - `digikuntz-transfert_backend/src/payment/gateway-factory.service.ts`, `gateway-loader.service.ts`, `payment-router.service.ts`, `payment.module.ts`, `interfaces/payment-gateway.interface.ts`, `providers/{flutterwave,paystack,mpesa}.provider.ts`
  - `digikuntz-transfert_backend/src/{dev/crypt.service.ts, mpesa/*, payin/*, payout/*, flutterwave/{flutterwave.service.ts, flutterwave-api.service.ts, payin-route.service.ts, mobile-money-network.util.ts, direct-charge.config.ts, flutterwave.controller.ts}, invoice/invoice.service.ts, payment-method/*, transaction/transaction.schema.ts}`
  - Référence API native : `ynkap-backend/src/financial-payment/strategies/{orange-money,mtn-money}/*.ts`, `util-strategy-func.ts`, `strategy-response-status.enum.ts`
- Ground truth (frontend admin `paymentGateway`) :
  - `src/app/feature-module/system-settings/gateway/gateway.component.{ts,html}`
  - `src/app/services/gateway/gateway.service.ts`
  - `src/app/feature-module/system-settings/payment-methods/payment-methods.component.ts` (sélecteur `gatewayId` déjà présent)
  - `src/assets/i18n/{fr,en}.json` (clés `systemSettings.gatewayType*`)
- Patterns backend à respecter :
  - **Credentials** : jamais en clair en base. `GatewayService.create/update` → `CryptService.encryptWithPassphrase(JSON.stringify(creds))` ; lecture via `CryptService.decryptWithPassphrase`. Chargement au runtime : `FlutterwaveService.loadDbCredentials(currency?, gatewayId?)` préfère `{type,currency,isActive}` puis « tout gateway actif », et `GatewayLoaderService.loadAndCache` fait `gws.find(isActive) || gws[0]` (par devise).
  - **Service natif** : calquer sur `src/mpesa/mpesa.service.ts` — `HttpService` + `firstValueFrom(rxjs)`, `setCredentials(creds)` lisant les clés min/majuscules, getters privés, token en cache avec expiration.
  - **Provider gateway** : calquer sur `src/payment/providers/mpesa.provider.ts` — implémente `PaymentGateway` (14 méthodes), méthodes non supportées → `new HttpException({message}, HttpStatus.NOT_IMPLEMENTED)` (501).
  - **Feature flags env** : calquer sur `src/flutterwave/direct-charge.config.ts` (`parseBooleanFlag`, master switch `DIRECT_CHARGE_ENABLED` défault `false`). Erreur ambiguë ≠ rejet pré-charge : `isPreChargeRejection` (`mobile-money-charge.builder.ts`) + `isHostedFallbackEnabled` — jamais de repli hébergé après qu'une charge a pu partir.
  - **Modules** : calquer sur `src/mpesa/mpesa.module.ts` (HttpModule, ConfigModule, `MongooseModule.forFeature([Payin/Payout/Gateway])`, CryptService, exports du service). `payment.module.ts` importe les modules gateway en `forwardRef`.
  - **Contrôleur** : `AuthGuard('jwt')` + `req.user.isAdmin` pour tout endpoint admin ; webhook/notify public mais sans secret exposé.
- Patterns frontend à respecter :
  - Formulaire gateway **déjà piloté par un mapping** `CREDENTIAL_FIELDS: Record<type, CredentialField[]>` dans `gateway.component.ts` + `onTypeChange` qui supprime/recrée les contrôles `cred_*`. **Aucune modification HTML nécessaire** : ajouter deux entrées au mapping suffit (le `*ngFor` du formulaire ET la vue détail `credentialFieldMap[viewingGateway.type]` sont déjà dynamiques).
  - Liste déroulante `gatewayTypes` (value + labelKey i18n), devise déjà dans `currencies = ['XAF','XOF','NGN','KES']`.
  - i18n : clés `systemSettings.*` dans `fr.json` et `en.json`.
- Constraints :
  - NestJS 11, Mongoose 8, axios 1.8, rxjs 7 (backend) ; Angular 18, Karma/Jasmine, @ngx-translate (frontend).
  - `GATEWAY_CURRENCIES` contient déjà `XAF` — pas de changement devise.
  - **Ne PAS toucher à `PaymentMethodProvider`** (`payment-method.schema.ts`) ni à sa DTO dans ce chantier : la création des PaymentMethods (qui choisit déjà `gatewayId` dans le formulaire admin) est un chantier de suivi.
  - Validation globale `whitelist+forbidNonWhitelisted` (`main.ts`) — tout champ non déclaré dans une DTO est refusé ; les routes natives doivent déclarer des DTO ou passer par des bodies typés.

## Goal

Ajouter deux types de passerelle `orange_cm` et `mtn_cm` (devise XAF) administrables depuis l'admin comme les existantes, avec des services natifs Cameroun calqués sur les stratégies ynkap (OM : token OAuth2 Basic + `mp/init` → `payToken` → `mp/pay` + `paymentstatus/{token}` ; MTN : token Basic `{uuid}:{apiKey}` + `requesttopay` + statut par GET), exposés via le contrat `PaymentGateway` existant (factory par devise), et routés en chemin **parallèle** au direct charge Flutterwave grâce au `gatewayId` déjà porté par les transactions/méthodes de paiement.

Critères de succès :
1. Un admin peut créer/éditer une passerelle `orange_cm` et `mtn_cm` (champs credentials dédiés, chiffrés en base) — backend + frontend.
2. `GatewayFactoryService.forCurrency('XAF')` construit les providers natifs ; les méthodes non applicables répondent 501 comme M-Pesa.
3. Un payin XAF dont la `PaymentMethod.gatewayId` pointe une passerelle `orange_cm`/`mtn_cm` est débité par le canal natif (init + pay / requesttopay) avec idempotence (`txRef` local, `X-Reference-Id` unique), persistance `Payin(provider=orange_cm|mtn_cm, meta.flow=native_cm)`, et réconciliation (polling cron + callback OM) mappant les statuts natifs vers `PayinStatus`.
4. Aucune régression sur le chemin Flutterwave (une charge native ambiguë ne bascule jamais vers l'hébergé ; le fallback hébergé n'est autorisé que sur rejet pré-charge).
5. `npm run build`, `npm run lint`, `npm test` (backend) et `npm run build` (frontend) passent.

## Out of scope

- Création de PaymentMethods liées aux nouvelles passerelles (le formulaire admin `payment-methods` accepte déjà `gatewayId` ; l'énum `PaymentMethodProvider` reste inchangée — chantier de suivi).
- Payout/withdrawal natif (MTN `requesttowithdraw`, OM disbursement) : les providers exposeront ces méthodes en 501, comme M-Pesa. Seul l'**encaissement** est natif dans ce chantier.
- `getBalance` natif : OM/MTN n'ont pas d'endpoint solde dans les stratégies ynkap → 501 (documenté).
- Redesign de `GatewayLoaderService` / de la règle « première passerelle active par devise » : on documente la règle et on rend le choix déterministe (voir Risques R1), sans réécrire le chargeur.
- Modèle de données `PaymentMethodProvider` et index unique `{countryId,provider,name}`.

## Tasks

Ordre global : backend (schéma → DTO → services natifs → providers → factory → routage payin → cron → env/doc → tests), puis frontend (mapping credentials → types → i18n → build/tests).

### Backend

1. **Étendre le type de passerelle** — fichiers : `src/gateway/gateway.schema.ts` — preuve : `npm run build` + test unitaire de validation.
   - `GatewayType = 'flutterwave' | 'paystack' | 'mpesa' | 'orange_cm' | 'mtn_cm'`
   - `@Prop({ required: true, enum: ['flutterwave','paystack','mpesa','orange_cm','mtn_cm'] })` (l'enum du `@Prop` est DUPLIQUÉ — les deux endroits doivent changer).
   - Commentaire : `GATEWAY_CURRENCIES` inchangé (`XAF` présent), mais préciser qu'un document `Gateway` actif est requis par canal.

2. **Étendre la validation DTO** — fichiers : `src/gateway/create-gateway.dto.ts` (+ `update-gateway.dto.ts` hérite via `PartialType`) — preuve : `npm run build` + test unitaire.
   - `@IsIn(['flutterwave','paystack','mpesa','orange_cm','mtn_cm'])` (ligne 33) et `@ApiProperty({ enum: [...] })` (ligne 31) ? Non : `@ApiProperty` n'est qu'un décorateur de doc — changer la liste `@IsIn` et le `@ApiProperty` pour rester cohérent.

3. **Étendre l'enum provider des Payins** — fichiers : `src/payin/payin.schema.ts` — preuve : `npm run build`.
   - `PayinProvider` : + `ORANGE_CM = 'orange_cm'`, `MTN_CM = 'mtn_cm'`. Nécessaire pour que la réconciliation cron et la vue admin distinguent les payins natifs.
   - (Optionnel, recommandé) `src/payment/payment-router.service.ts` : `PaymentProvider` + `'orange_cm' | 'mtn_cm'` pour le typage.

4. **Créer le module natif Orange CM** — fichiers (nouveaux) : `src/orange-cm/orange-cm.module.ts`, `src/orange-cm/orange-cm.service.ts`, `src/orange-cm/orange-cm.controller.ts` — preuve : `npm run build` + specs dédiées (cf. tâche 12). Dépend de : 1.
   - Calqué sur `src/mpesa/*` (HttpModule + ConfigModule + `MongooseModule.forFeature([Payin, Payout, Gateway])` + `CryptService`, exports `[OrangeCmService]`).
   - `OrangeCmService.setCredentials(creds)` : champs `OM_API_PATH`, `OM_API_USERNAME`, `OM_API_PASSWORD`, `OM_API_X_AUTH_TOKEN`, `OM_API_CHANNELUSERMSISDN`, `OM_API_PIN` (variantes minuscules tolérées, cf. `MpesaService.setCredentials`). PIN, mot de passe et X-AUTH-TOKEN restent en attributs privés, jamais loggés.
   - `getToken()` : `POST {path}/token`, `Authorization: Basic base64(user:pass)`, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=client_credentials` → `data.access_token` ; cache avec expiration (T-5 min avant `expires_in`).
   - `initPay(token)` : `POST {path}/omcoreapis/1.0.2/mp/init`, headers `Authorization: Bearer`, `X-AUTH-TOKEN` → `data.data.payToken`.
   - `pay({payToken, subscriberMsisdn, amount, orderId, description, notifUrl})` : `POST {path}/omcoreapis/1.0.2/mp/pay` (mêmes headers + body : `channelUserMsisdn`, `subscriberMsisdn`, `amount` (string), `pin`, `orderId`, `description`, `payToken`, `notifUrl`). `notifUrl = {BACK_URL}/orange-cm/notify` (config existante `BACK_URL`).
   - `getStatus(token)` : `GET {path}/omcoreapis/1.0.2/mp/paymentstatus/{token}` → mapper `SUCCESSFULL|FAILED|PENDING|EXPIRED|CANCELLED` (+`reason.code` éventuel) vers `PayinStatus`/motif.
   - **Parsing tolérant** type `extractFWPayload` (`payin.service.ts`) : OM peut renvoyer `{data:{data:...}}`, `{data:...}` ou plat.
   - `OrangeCmController` (route `/orange-cm`) :
     - `POST /orange-cm/payin` (admin) : orchestration init→pay avec persist-then-charge (créer le `Payin` AVANT d'appeler /pay, réutiliser `PayinService.initPayin` et `generateTxRef`), `PayinProvider.ORANGE_CM`, `meta.flow='native_cm'`, `raw={payToken,...}`.
     - `POST /orange-cm/notify` (PUBLIC, pas d'auth JWT — appelé par Orange) : valider la forme du payload, retrouver le `Payin` par `orderId`/`txRef`, mapper le statut, marquer terminal OU laisser le cron trancher ; répondre `200` rapide (ACK) même si le traitement échoue (rejeu possible par Orange).
     - `GET /orange-cm/payin/:txRef` (admin) : statut courant.

5. **Créer le module natif MTN CM** — fichiers (nouveaux) : `src/mtn-cm/mtn-cm.module.ts`, `src/mtn-cm/mtn-cm.service.ts`, `src/mtn-cm/mtn-cm.controller.ts` — preuve : `npm run build` + specs (tâche 12). Dépend de : 1.
   - Même squelette que 4.
   - `setCredentials` : `MOMO_API_PATH`, `MOMO_API_KEY`, `MOMO_API_PRIMARY_KEY`, `MOMO_API_SECONDARY_KEY`, `MOMO_API_DEFAULT_UUID`, `MOMO_API_MODE_ENV` (mtn_mode : `sandbox`|`live`).
   - `getToken() : POST {path}/collection/token/`, `Authorization: Basic base64(defaultUuid:apiKey)`, `Ocp-Apim-Subscription-Key: primaryKey` → `data.access_token` ; cache avec expiration.
   - `requestToPay({partyId (subscriberMsisdn), amount, currency:'XAF', externalId, payerMessage, payeeNote})` : `POST {path}/collection/v1_0/requesttopay`, headers `Authorization: Bearer`, **`X-Reference-Id`** (UUID — cf. Risques R3), `Ocp-Apim-Subscription-Key`, `X-Target-Environment` ; body exactynkap (`payer: {partyIdType:'MSISDN', partyId}`, montant en string). L'API répond 202 = acceptée : **un 202 n'est PAS une confirmation de débit** — le statut doit être relu.
   - `getStatus(xRefId)` : `GET {path}/collection/v1_0/requesttopay/{xRefId}` → `status: PENDING|SUCCESSFUL|FAILED` (+`reason.code` : `PAYER_NOT_FOUND`, `PAYEE_NOT_FOUND`...) → mapping `PayinStatus`.
   - `MtnCmController` (route `/mtn-cm`) : `POST /mtn-cm/payin` (admin, persist-then-charge), `GET /mtn-cm/payin/:txRef` (admin). Pas de callback sortant (polling uniquement).
   - Conservé pour plus tard (hors scope) : `requesttowithdraw` / `checkWithdrawal`.

6. **Créer les providers du contrat `PaymentGateway`** — fichiers (nouveaux) : `src/payment/providers/orange-cm.provider.ts`, `src/payment/providers/mtn-cm.provider.ts` — preuve : `npm run build` + specs (tâche 12). Dépend de : 4, 5.
   - Implémenter les 14 méthodes du `PaymentGateway` en déléguant aux services :
     - `setCredentials` → `service.setCredentials`.
     - `createPayin(transactionData, userId)` → service (init→pay / requesttopay) avec `txRef`/`orderId` depuis `transactionData`.
     - `verifyPayin(txRef)` / `checkPayinStatus(transactionId, flwTxId?)` → service `getStatus`, en retrouvant `payToken`/`xRefId` dans `Payin.raw`/`meta`.
     - `processSuccessfulPayin(transaction, transactionId)` → réutilise le claim idempotent existant (cf. Risques R2).
     - Le reste (`getBalance`, `listPayinTransactions`, `withdrawal`, `payout`, `verifyPayout`, `getBanksList`, `createTransferFromBalance`, `checkPayoutStatus`) → `HttpException` 501, message explicite (calqué sur `MpesaProvider`).

7. **Étendre la factory** — fichiers : `src/payment/gateway-factory.service.ts` — preuve : spec factory (tâche 12) + `npm run build`. Dépend de : 6.
   - Injecter `OrangeCmService` et `MtnCmService` en constructor.
   - `createProvider(type)` : + `case 'orange_cm': return new OrangeCmProvider(this.orangeCmService)` et idem MTN.
   - `GatewayLoaderService.toConfig` (`gateway-loader.service.ts`) : vérifier que les credentials natifs passent (le `...creds` du spread les transporte déjà ; `secretKey` restera `''` pour les natifs — inoffensif, mais ajouter un commentaire). Aucun changement de contrat requis.

8. **Câbler les modules** — fichiers : `src/payment/payment.module.ts`, `src/app.module.ts` — preuve : `npm run build` + **démarrage de l'appli** (`npm run start:prod` dry ou lancement local ; les erreurs de DI ne se voient qu'au boot, cf. commentaire dans `payin-route.service.ts`). Dépend de : 7.
   - `payment.module.ts` : `forwardRef(() => OrangeCmModule)`, `forwardRef(() => MtnCmModule)`.
   - `app.module.ts` : importer `OrangeCmModule`, `MtnCmModule` (vérifier la liste actuelle des imports).

9. **Routage payin : chemin natif parallèle** — fichiers : `src/flutterwave/flutterwave.controller.ts` (route `POST /fw/payin`, lignes ~204-280) et `src/flutterwave/payin-route.service.ts` (+ `src/invoice/invoice.service.ts` ligne ~631 sans changement de contrat) — preuve : specs `payin-route.service.spec.ts` étendues + test e2e ciblé. Dépend de : 8.
   - Le routage par `gatewayId` existe DÉJÀ : `flutterwave.controller.ts` lit `payerMethod.gatewayId._id` (~ligne 251-253) et pose `data.gatewayId` ; `PayinService`/`FlutterwaveService` chargent les creds par gateway. Compléter : après résolution de la `PaymentMethod`, charger le `Gateway` cible ; si `gateway.type === 'orange_cm'|'mtn_cm'` **et** `isDirectChargeEnabled`-équivalent natif (`NATIVE_PAYIN_ENABLED`, cf. tâche 11) → déléguer à `OrangeCmService`/`MtnCmService` au lieu de `fw.createDirectPayin` ; sinon chemin historique inchangé.
   - « Chemin PARALLÈLE » : ne pas toucher à `createDirectPayin`/`createPayin` Flutterwave ; ajouter le branchement en amont (dans le contrôleur ou dans `PayinRouteService.resolve` via un service de routage natif injecté).
   - Vérification numéro : réutiliser `resolveMobileMoneyNetwork` (`mobile-money-network.util.ts`) sur `subscriberMsisdn` CM pour **valider que l'opérateur correspond au type de passerelle** (Orange CM n'accepte que les préfixes Orange `655-659|686-689|69x`, MTN `65x|67x|68x`) ; rejet **pré-charge** (avant tout appel natif) sinon → fallback hébergé Flutterwave autorisé (même sémantique que `isPreChargeRejection`).

10. **Réconciliation des payins natifs** — fichiers : `src/payin/payin.cron.ts`, `src/payin/payin.service.ts`, éventuellement `src/payin/payin.schema.ts` (index) — preuve : spec cron/service. Dépend de : 9.
    - Ajouter les flows natifs : `NATIVE_CM_FLOWS = ['native_cm']` à côté de `DIRECT_CHARGE_FLOWS` (`payin.service.ts`) et `findPendingNativeCharges(limit)` filtrant `meta.flow: {$in: NATIVE_CM_FLOWS}` et par `provider`.
    - Nouveau cron calqué sur `handleDirectChargeCron` (`EVERY_30_SECONDS`, verrou `cron:payin:native`, budget wall-clock, fenêtre de clôture `NATIVE_CM_CLOSE_MINUTES` configurable, défaut ~30) : pour chaque payin natif → `verify` via le service natif (statut OM/MTN), marquer `successful`/`failed` (via le claim idempotent) ou `failed` après clôture (`verifyAndClosePayin`-équivalent natif).
    - Attention limite : `PayinCron.handleCron` (hosted) exclut déjà `DIRECT_CHARGE_FLOWS` via `$nin` — l'exclure aussi de `NATIVE_CM_FLOWS`, sinon double fenêtre de polling.

11. **Env, feature flags et documentation** — fichiers : `.env.example` (à créer — absent du repo), `src/payment/native-payin.config.ts` (nouveau, calqué sur `direct-charge.config.ts`) — preuve : `npm run build` + lecture config.
    - `NATIVE_PAYIN_ENABLED` (défaut `false`, master switch), `NATIVE_CM_CLOSE_MINUTES` (défaut 30), réutiliser `isHostedFallbackEnabled` existant pour le repli.
    - Documenter dans `.env.example` : `BACK_URL` (déjà utilisé pour `notifUrl`), commentaire que les secrets OM/MTN sont portés par `Gateway.credentials` en base (chiffrés), PAS par `.env` (différence majeure avec ynkap où tout venait des env).

12. **Tests backend (TDD)** — fichiers : `src/gateway/gateway.schema.spec.ts` (si absent : au moins un spec validant les types), `src/orange-cm/orange-cm.service.spec.ts`, `src/mtn-cm/mtn-cm.service.spec.ts`, `src/payment/providers/orange-cm.provider.spec.ts`, `src/payment/providers/mtn-cm.provider.spec.ts`, `src/payment/gateway-factory.service.spec.ts` (étendre), `src/payment/native-payin.config.spec.ts`, étendre `src/flutterwave/payin-route.service.spec.ts` et `src/payin/payin.service.spec.ts` — preuve : `npm test`. Dépend de : 1-11.
    - Style observé : specs pures avec mocks manuels (cf. `payin-route.service.spec.ts`, `flutterwave-api.service.spec.ts` qui mock `GatewayLoaderService` en `useValue`).
    - Cas exigés : token cache/expiration ; construction Basic (sans log de secret) ; mapping statuts OM (`SUCCESSFULL/PENDING/FAILED/EXPIRED/CANCELLED`) et MTN (`SUCCESSFUL/PENDING/FAILED` + `reason.code`) ; 202 MTN ≠ débit ; rejet pré-charge sur opérateur incohérent ; factory `forCurrency('XAF')` retourne le provider natif selon le type chargé ; idempotence du claim (double `processSuccessfulPayin`).

### Frontend admin (`paymentGateway`)

13. **Mapping credentials natifs** — fichiers : `src/app/feature-module/system-settings/gateway/gateway.component.ts` — preuve : `npm run build` + test unitaire léger du mapping (voir tâche 16). Dépend de : 12 (indépendant côté repo, mais la validation backend doit accepter les types).
    - `CREDENTIAL_FIELDS` : ajouter
      - `orange_cm`: `OM_API_PATH` (req), `OM_API_USERNAME` (req), `OM_API_PASSWORD` (req), `OM_API_X_AUTH_TOKEN` (req), `OM_API_CHANNELUSERMSISDN` (req), `OM_API_PIN` (req), `OM_API_MERCHANT_KEY` (facultatif — réservé, non utilisé par la stratégie de référence).
      - `mtn_cm`: `MOMO_API_PATH` (req), `MOMO_API_PRIMARY_KEY` (req), `MOMO_API_SECONDARY_KEY` (facultatif), `MOMO_API_KEY` (req), `MOMO_API_DEFAULT_UUID` (req), `MOMO_API_MODE_ENV` (req, defaultValue `'sandbox'`).
    - `gatewayTypes` : + `{ value: 'orange_cm', labelKey: 'systemSettings.gatewayTypeOrangeCm' }`, `{ value: 'mtn_cm', labelKey: 'systemSettings.gatewayTypeMtnCm' }`.
    - Aucun changement HTML : le `*ngFor` du formulaire (lignes 112-129) et la vue détail (ligne 29) sont déjà pilotés par `credentialFieldMap[type]` / `credentialFields`.

14. **i18n** — fichiers : `src/assets/i18n/fr.json`, `src/assets/i18n/en.json` (bloc `systemSettings`, ~lignes 1591-1644) — preuve : `npm run build`.
    - `gatewayTypeOrangeCm: "Orange Money Cameroun" / "Orange Money Cameroon"`, `gatewayTypeMtnCm: "MTN MoMo Cameroun" / "MTN MoMo Cameroon"`.

15. **Listing et détail** — fichiers : aucun (relecture de `gateway.component.html`) — preuve : vérification manuelle du rendu en dev (`ng serve`).
    - Le listing/détail affiche déjà `viewingGateway.type` et les champs depuis `credentialFieldMap[viewingGateway.type]` : les nouvelles passerelles apparaissent sans code additionnel. Ajout éventuel d'un badge de type lisible si souhaité (optionnel, hors contrat).

16. **Tests frontend** — fichiers : `src/app/feature-module/system-settings/gateway/gateway.component.spec.ts` (nouveau, si l'infra karma est utilisable en CI ; aucune spec existante pour ce composant) — preuve : `npm test` (karma) OU au minimum build+lint si karma est non fonctionnel en CI (à confirmer, cf. Validation).

## Security

- **Surfaces touchées** :
  - `Gateway.credentials` (chiffré AES-256-CBC + HMAC par `CryptService` avec `CRYPT_KEY` ; PIN OM, password, X-AUTH-TOKEN, apiKey MTN transitent par ce canal — jamais en clair, jamais loggés. Le contrôleur gateway `scrubGateway`/`scrubCredentials` masque déjà les creds pour les non-admins : rien à changer, mais les nouveaux types héritent de la projection allow-list).
  - `POST /orange-cm/notify` (public, appelé par Orange) : ne **jamais** exposer d'info sensible dans la réponse, ACK rapide, traitement idempotent par `orderId`/`txRef` (rejeu sûr), option d'un secret partagé (`OM_NOTIFY_SECRET`) à valider dans le header si Orange le supporte — à confirmer avant mise en prod (Risque R4).
  - Routage payin : la sélection de passerelle doit rester **côté serveur** (depuis `PaymentMethod.gatewayId` validé), jamais pilotée par un champ client libre ; l'IP vient de `resolveClientIp(req)` comme le chemin direct actuel.
  - Aucun affaiblissement des guards existants : endpoints admin natifs → `AuthGuard('jwt')` + `req.user.isAdmin` ; le notify est le seul endpoint public (comme le webhook Flutterwave existant).
  - Limite de corps `1mb` + ValidationPipe global `whitelist/forbidNonWhitelisted` : les DTO des nouveaux endpoints doivent déclarer explicitement les champs acceptés.

## Risks

- **R1 — Sélection de la passerelle pour une même devise (XAF)** : `GatewayLoaderService.loadAndCache` prend `gws.find(isActive) || gws[0]` (ordre d'insertion en base, non déterministe si plusieurs passerelles XAF actives) ; `FlutterwaveService.loadDbCredentials(currency)` préfère `type:'flutterwave'` puis « tout actif ». Si OrangeCM/MTNCM/Flutterwave sont tous actifs sur XAF, le chemin générique par devise devient ambigu. — **Décision à trancher avant de coder** : (a) rendre l'auto-sélection déterministe (ajouter un tri explicite, ex. `createdAt`) et documenter « une seule passerelle active par devise pour le routage auto » ; (b) router les payins natifs **exclusivement** par `gatewayId` (mécanisme déjà en place : PaymentMethod → transaction.gatewayId → chargement des creds par id). Recommandation : **(b) pour les payins, (a) documenté pour le routage générique (balance/payout)** — le chiffrage de ce chantier favorise (b) avec fallback (a) non modifié.
- **R2 — Claim/credit idempotent** : `FlutterwaveService.processSuccessfulPayin` (claim par `txRef`, crédit solde/commission) est le seul endroit sûr de bilan. Les providers natifs doivent le réutiliser (DI de `FlutterwaveService` — constructeur lourd mais fonctionnel, pattern déjà utilisé via `forwardRef`) plutôt que d'en recopier la logique. Alternative : extraire un service de claim partagé — refactor plus large, à écarter pour ce chantier (Risque de régression élevé). — **Décision à trancher avant de coder** : réutiliser `processSuccessfulPayin` (recommandé) vs extraction.
- **R3 — Idempotence MTN `X-Reference-Id`** : l'API MTN exige un UUID ; ynkap passe naïvement `financialTransaction.ref` (ObjectId Mongo). Un ObjectId n'est pas un UUID v4 : MTN peut rejeter ou collisionner. — **Décision** : générer `uuidv4()` par payin, le stocker (`Payin.raw.xRefId` ou `meta`), le réutiliser pour `verify` ; `externalId` garde la valeur lisible `txRef`. Ne jamais retenter un `requesttopay` avec un nouveau X-Reference-Id sur un payin `pending` sans vérifier le statut précédent.
- **R4 — Callback OM (`notifUrl`)** : le payload de notification Orange n'est pas documenté dans la stratégie de référence ; le format exact (champs, signature, enveloppe) doit être capturé en sandbox avant mise en prod. Le polling `paymentstatus` reste la source de vérité (le callback sert d'accélérateur). Le notify ne doit jamais conclure seul un payin si l'enveloppe diffère du modèle — le cron tranchera.
- **R5 — Erreurs ambiguës OAuth/HTTP** : un timeout sur `mp/pay` ou sur `requesttopay` peut cacher un débit réussi. Règles à respecter (cf. invariant `payin-route.service.ts`) : pas de repli hébergé après un appel parti ; seulement les rejets **pré-charge** (validation numéro/opérateur, creds absentes, payToken non obtenu) autorisent le fallback ; `NATIVE_PAYIN_ENABLED=false` est le rollback master (comme `DIRECT_CHARGE_ENABLED`).
- **R6 — Formats de statut divergents** : OM `SUCCESSFULL` (double L), MTN `SUCCESSFUL` — ne pas partager un mapping naïf ; tests de mapping par fournisseur (tâche 12).
- **R7 — `GATEWAY_CURRENCIES` et DTO** : `XOF` historiquement manquant dans deux copies (cf. commentaire `gateway.schema.ts`) — vérifier que le formulaire frontend (`currencies`) et le DTO restent alignés après l'ajout (aucun changement attendu ici, `XAF` présent partout).

## Validation

Commandes réelles issues des manifests (vérifiées dans `package.json` des deux projets) :

Backend (`/Users/flambel/Documents/GitHub/digikuntz-transfert_backend`):
- `npm run build` (nest build)
- `npm run lint` (eslint `{src,apps,libs,test}/**/*.ts` --fix)
- `npm test` (jest, `rootDir: src`, `testRegex: .*\.spec\.ts$`)
- `npm run test:cov` (jest --coverage — objectif ≥ 80% sur les nouveaux services/providers, cf. `tdd-workflow`)
- `npm run test:e2e` (jest config `./test/jest-e2e.json`)
- Démarrage local `npm run start:dev` (obligatoire : les erreurs de DI modules n'apparaissent qu'au boot)
- Pour vérifier les routes : Swagger à `http://127.0.0.1:3002/api/docs` hors production (cf. `main.ts`)

Frontend (`/Users/flambel/Documents/GitHub/paymentGateway`):
- `npm run build` (ng build)
- `npm run lint` (ng lint)
- `npm test` (ng test — karma/jasmine). ⚠️ Aucune spec n'existe pour `gateway.component` et karma nécessite Chrome : si la CI ne peut pas lancer de navigateur, la preuve de la tâche 16 se limite à build+lint — à confirmer avec l'équipe avant d'exiger `npm test` au CI.
