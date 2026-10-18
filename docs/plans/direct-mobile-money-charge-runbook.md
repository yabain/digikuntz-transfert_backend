# Runbook — Débit mobile money direct (Flutterwave)

Ce document accompagne `docs/plans/direct-mobile-money-charge.md`. Il décrit ce qui
a été livré, comment l'activer / le désactiver, et ce qu'il reste à faire côté
tableau de bord Flutterwave.

---

## 1. Ce qui est livré

Un paiement **mobile money direct** : le payeur reçoit une demande de validation
(push / USSD) sur son téléphone. Il n'y a **pas** de page de paiement hébergée à
ouvrir, donc pas de `redirect_url` à suivre dans la plupart des cas.

Trois points d'entrée l'utilisent :

| Point d'entrée | Route | Comportement |
|---|---|---|
| Facture | `POST /invoices/:id/pay` avec `paymentMethod: 'mobile_money'` | Charge directe, repli hébergé si refus avant toute requête |
| Demande de paiement | `POST /payment-request` avec `paymentMethod: 'mobile_money'` | Idem |
| API / sandbox | `POST /fw/direct-charge` | Charge directe uniquement (503 si désactivé) |

Le frontend affiche un **loader** dès l'initiation, puis le **statut final**
(succès / échec) quand la transaction se termine.

### Deux voies d'encaissement, chacune son service et sa route

| Voie | Service (point d'entrée) | Route propre | Ce qui se passe |
|---|---|---|---|
| **Directe** | `PayinRouteService.payDirect()` → `FlutterwaveService.createDirectPayin()` | `POST /fw/direct-charge` | Débit mobile money (push / USSD), sans interface hébergée |
| **Hébergée** | `PayinRouteService.payHosted()` → `FlutterwaveService.createPayin()` | `POST /fw/payin` | Le prestataire fournit une URL d'interface (`redirect_url`) |

`PayinRouteService.resolve()` est **l'unique aiguillage** : la facture et la demande
de paiement l'appellent, au lieu de recopier chacune la règle. Règle appliquée :

1. `paymentMethod ≠ 'mobile_money'` (carte, absent) → voie **hébergée** ;
2. sinon voie **directe**, et repli vers l'hébergée **uniquement** sur un rejet
   *pré-charge* (invariant : une erreur ambiguë ne bascule jamais, sous peine de
   double débit).

La facture et la demande de paiement sont donc branchées sur la voie **directe**,
tout en conservant l'ancienne voie hébergée intacte et utilisable séparément.

---

## 2. Activation et rollback

Trois variables, à définir dans `.env` :

| Variable | Défaut | Rôle |
|---|---|---|
| `DIRECT_CHARGE_ENABLED` | `false` | **Levier de rollback principal.** À `false`, la facture et la demande de paiement repassent silencieusement par la page hébergée (comportement d'avant la fonctionnalité), et `/fw/direct-charge` répond `503`. |
| `DIRECT_CHARGE_FALLBACK_HOSTED` | `true` | Autorise le repli hébergé quand la voie directe est refusée **avant** toute requête Flutterwave. À `false`, ce cas échoue franchement au lieu d'ouvrir un autre parcours. |
| `DIRECT_CHARGE_CLOSE_MINUTES` | `30` | Durée maximale pendant laquelle un débit direct reste `pending` avant clôture par le cron. |

**Rollback en cas d'incident :** passer `DIRECT_CHARGE_ENABLED=false` puis
redémarrer l'application. Aucune migration, aucun retour arrière de code n'est
nécessaire.

> Le drapeau est délibérément « fermé par défaut » : une variable absente ou mal
> orthographiée ne peut pas activer un chemin qui déplace de l'argent.

---

## 3. Webhook Flutterwave (à configurer)

**URL à renseigner dans le tableau de bord Flutterwave :**

```
https://app.digikuntz.com/fw/webhook
```

(Remplacer l'hôte par celui de l'API en production. En local, utiliser une URL
ngrok, comme pour `MPESA_STK_CALLBACK_URL`.)

- Méthode : `POST`. La route répond toujours `200` pour éviter les rejeux.
- **Secret hash** : la valeur exacte de `FLUTTERWAVE_SECRET_HASH` enregistrée dans
  la ligne `Gateway` correspondante. Le webhook la compare à l'en-tête
  `verif-hash`.
- À renseigner sur **chaque** ligne `Gateway` de type `flutterwave` (une par
  devise chez un marchand multi-devises). Le code accepte n'importe laquelle de
  ces valeurs, ce qui couvre le cas d'un redémarrage avant qu'une charge n'ait
  chargé les identifiants en mémoire.

**Pourquoi c'est important :** la synchro de statut repose sur ce webhook. S'il
n'est pas configuré, le statut finit quand même par converger (cron 30 s + filet
de réconciliation 15 min), mais avec un délai, et le payeur attend devant son
loader.

### À surveiller dans les logs

- `Invalid Flutterwave webhook signature` → hash non configuré ou erroné.
- `Charge result not attached for txRef=…` → anomalie : le payin était déjà final
  ou n'appartenait pas à la transaction attendue.
- `Direct-charge cron budget reached` → plus de 50 débits en attente en 18 s ;
  le reste est repris au tour suivant.

---

## 4. Couverture devises / opérateurs

| Devise | Type de charge | Opérateurs |
|---|---|---|
| XAF | `mobile_money_franco` | MTN, Orange Money |
| XOF | `mobile_money_franco` | Orange Money (SN, ML), Free / Wave (SN), MTN / Wave (CI), Moov / Orange Money (BF) |
| NGN | `mobile_money_nigeria` | MTN, Airtel, Glo, 9mobile |
| GHS | `mobile_money_ghana` | MTN, Vodafone, AirtelTigo |
| UGX | `mobile_money_uganda` | MTN, Airtel |
| RWF | `mobile_money_rwanda` | MTN, Airtel |
| KES | `mpesa` | M-Pesa — **chemin historique conservé, non modifié** |

**L'opérateur est déduit du préfixe du numéro.** Les tables de préfixes ne sont
renseignées que pour le Cameroun (seule source fiable disponible dans le dépôt).
Pour les autres pays, l'utilisateur doit choisir l'opérateur dans le formulaire ;
c'est pourquoi la liste déroulante du frontend couvre l'intégralité du vocabulaire
accepté par le backend.

### XOF — activée côté code, à activer côté exploitation

L'énumération `Gateway.currency` accepte désormais **XOF** (`GATEWAY_CURRENCIES`,
source unique partagée par le schéma, le DTO et le formulaire d'administration).

**Autoriser la devise ne suffit pas** : il faut créer une passerelle Flutterwave
`currency: "XOF"` avec ses credentials (clé secrète + `FLUTTERWAVE_SECRET_HASH`).
Tant qu'elle n'existe pas, un paiement en XOF s'arrête **avant toute écriture**
sur une erreur explicite :

```
No Flutterwave gateway credentials configured for currency "XOF"
```

Aucun payin ni transaction n'est créé, et la facture redevient payable — c'est
volontaire : échouer après la persistance laisserait un payin `pending` qu'aucun
cron ne pourrait réconcilier, faute de credentials.

Prérequis côté données : que le pays de l'utilisateur porte bien `currency: "XOF"`
(SN, CI, BF, ML…). Les préfixes d'opérateurs ne sont renseignés que pour le
Cameroun : ailleurs, **l'opérateur doit être choisi explicitement** dans le
formulaire, sinon la charge est refusée en pré-charge et bascule sur la page
hébergée.

### Hors périmètre (assumé)

- **V2 / OTP** : `authorization_code` (seconde étape) n'est pas implémenté. Les
  opérateurs qui l'exigent obligatoirement (Burkina Faso + Orange Money) sont
  refusés en pré-charge et basculent vers la page hébergée.
- **TZS / ZMW** : type de charge non vérifié, volontairement absents.

---

## 5. Notes d'exploitation

- Le cron « débit direct » tourne toutes les 30 s, avec un budget de 18 s par
  passage (verrou distribué de 25 s).
- Le cron hébergé (10 s) **exclut** désormais les payins du chemin direct : sans
  cela chaque débit direct était interrogé deux fois par cycle.
- La route `POST /payin/webhook` reste désactivée — ne pas la réactiver.
- Les réglages de repli sur ce parcours : `POST /fw/verify-payin/:txRef` et le
  filet de réconciliation toutes les 15 min.

---

## 6. Sémantique des échecs — à connaître avant de toucher au code

C'est le point le plus délicat du parcours, et il est **volontaire** :

| Type d'échec | Ce qui est écrit | Pourquoi |
|---|---|---|
| Rejet **avant** toute requête (devise non supportée, opérateur indéductible, montant hors bornes, drapeau désactivé) | Payin `failed` (terminal) | Aucun argent n'a pu bouger. La facture redevient payable et le repli hébergé est possible. |
| Échec **ambigu** (timeout, 5xx, socket coupé, 4xx amont) | Payin laissé `pending` | La charge a peut-être **réussi** et la réponse a été perdue. Fermer le payin perdrait définitivement le paiement : le cron ne balaie que les `pending` et le webhook ignore les états terminaux. |

Dans le cas ambigu, la vérité est tranchée par `verify_by_reference` (le cron interroge Flutterwave **par `tx_ref`**, sans avoir besoin de `flwTxId`), puis :
- la charge a réussi → `processSuccessfulPayin` crédite la facture (idempotent) ;
- elle a échoué → le payin est clos en `failed` et la transaction passe en erreur.

**Corollaire :** ne jamais « nettoyer » un payin `pending` en le passant manuellement en
`failed`. Ce n'est pas une donnée périmée, c'est une réconciliation en cours.

Échec synchrone (Flutterwave répond explicitement `failed`) : le payin passe en `failed`
et, côté facture comme côté demande de paiement, la transaction est close immédiatement
pour que l'interface affiche l'échec sans attendre son délai maximal.

---

## 7. Risques connus à traiter

1. **Ancienne fuite de credentials (corrigée).** `GET /gateways` et
   `GET /gateways/:id` étaient **publics** et renvoyaient les identifiants
   **déchiffrés** (`FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_SECRET_HASH`). Ils
   exigent maintenant un JWT et les credentials sont masqués pour les
   non-administrateurs. **Si ces routes ont été exposées sur Internet, il faut
   faire tourner les clés et le secret hash concernés.**
2. **`POST /payin/initialize` est public** et accepte `txRef`, `amount` et
   `transactionId` fournis par l'appelant. Le frontend le marque explicitement
   « Not used ». C'était le maillon qui rendait exploitable l'ancienne faille de
   `txRef` sur `/fw/direct-charge` ; la faille est fermée côté charge, mais la
   route reste un moyen non authentifié de créer des payins en attente. À
   supprimer ou à protéger par un guard, après vérification qu'aucun appelant
   externe ne l'utilise.
3. **XOF** reste bloqué par l'énumération `Gateway.currency`
   (`['XAF','NGN','KES']`) : la résolution de devise lève une exception au lieu
   d'un rejet pré-charge. À étendre à la devise, ou à classer en rejet
   pré-charge, avant d'annoncer XOF comme supporté.
4. **`POST /fw/direct-charge` accepte toujours un corps non typé** (`data: any`)
   pour ne pas casser les appelants existants : le plafond de montant et la
   longueur d'email sont donc validés côté serveur dans le builder, faute de DTO.
   Un appelant externe doit savoir que la route répond désormais `503` par défaut
   (drapeau fermé) et que l'opérateur n'est plus déduit du code du moyen de
   paiement.
5. **`src/common/upload-dir.util.spec.ts` échoue** (préexistant, hors sujet) : le
   test attend une exception alors que l'implémentation documente un repli
   silencieux. À trancher avec l'équipe.
