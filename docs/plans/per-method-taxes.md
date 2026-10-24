# Frais par méthode de paiement (taxesPayment / taxesTransfer)

## Objectif

Chaque flux doit calculer ses frais avec le taux de la **méthode de paiement
sélectionnée**, et non plus avec le taux système global :

| Flux | Champ de la méthode |
|---|---|
| Facture (payin, direct **et** hébergé) | `taxesPayment` |
| Transfert (send-money) | `taxesTransfer` |
| Paiement de service | `taxesPayment` |
| Fundraising | `taxesPayment` |
| Abonnement (plan) | `taxesPayment` |
| Dev | `invoiceTaxes` **système** (pas d'override) |

Repli : si aucune méthode n'est résolue, on retombe sur `invoiceTaxes` système.

## Constat (état actuel)

- `transaction.service.ts:1588` calcule un taux depuis `transactionData.invoiceTaxes`
  mais `:1603` passe `undefined` → **l'override est mort**. Tous les flux paient
  le taux système.
- `POST /fw/payin` (`flutterwave.controller.ts:192`) prend `@Body() any` et le
  spread dans `transactionData` → si l'override devient vivant, un client
  pourrait forcer `taxes = 0`.
- `POST /fw/direct-charge` (`flutterwave.controller.ts:252`) utilise
  `taxesTransfer` pour un **payin** (incohérent).
- Dev (`dev.service.ts:641,684`) utilise aussi `taxesTransfer` pour un payin.

## Conception

### 1. Champ interne serveur : `taxRateOverride`

Nouveau champ **numérique interne** sur `transactionData`, jamais exposé au
client. `createTransaction` l'honore s'il est défini, sinon taux système.

```ts
const raw = transactionData.taxRateOverride;
const override = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
const taxRate = Number.isFinite(override)
  ? Math.max(0, override)
  : Number(systemData?.invoiceTaxes) || 0;
```

### 2. Assainissement des endpoints à body client

Tout endpoint recevant un body non typé **retire** `taxRateOverride` du body
client puis le pose lui-même après résolution serveur de la méthode :

- `POST /fw/payin` → si `paymentMethod` (code) fourni : `findByCode`, contrôle
  `currency` + `statusPayin`, `taxRateOverride = method.taxesPayment`.
- `POST /fw/transfer-from-balance` → si `paymentMethod`/`bankCode` fourni :
  `statusPayout`, `taxRateOverride = method.taxesTransfer`.
- `POST /fw/direct-charge` → `taxesPayment` (payin) au lieu de `taxesTransfer`.

### 3. Par flux

- **Facture** : `InitiateInvoicePaymentDto.paymentMethodCode?` ; `initiatePayment`
  résout la méthode, pose `taxRateOverride = taxesPayment`, et `computeFees`
  utilise ce taux pour l'affichage (`feesAmount/amountToPay`).
- **Transfert** : le front envoie déjà `paymentMethod = code` ; le contrôleur
  résout et pose `taxRateOverride = taxesTransfer` (utilisé pour le débit et la
  persistance, cohérents).
- **Service / Abonnement** : passent par `/fw/payin` ; le front envoie
  `paymentMethod = code` de la méthode choisie.
- **Fundraising** : `donate`/`donate/public` acceptent `paymentMethodCode?` ;
  le service résout et pose `taxRateOverride = taxesPayment`.
- **Dev** : **suppression** de l'override (retour au taux système).

### 4. Sécurité

- `taxRateOverride` est **serveur uniquement** : supprimé des bodies clients.
- La méthode doit matcher la devise, `statusPayin`/`statusPayout` selon le sens.
- `findByCode` renvoie `null` si absente → repli taux système (pas d'erreur dure).

## Preuves attendues

- `tsc` 0 des deux côtés, `ng build` 0, `jest` vert.
- Un test unitaire prouvant que `createTransaction` honore `taxRateOverride`
  et ignore un `taxRateOverride` client sur `/fw/payin`.
