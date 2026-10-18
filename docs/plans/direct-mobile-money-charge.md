# Plan: Direct mobile-money charge + transaction status synchronisation

Status: **PLANNING ONLY — no source file may be modified by this document's author.**
Owner: Senior Technical Planner · Consumer: `tdd-workflow` skill.

---

## Context

### Ground truth (files read)

Backend `/Users/flambel/Documents/GitHub/digikuntz-transfert_backend` (NestJS 11, Mongoose 8, Jest `rootDir: src`, `testRegex .*\.spec\.ts$`, **no `mongodb-memory-server`**):

| File | What it told us |
|---|---|
| `package.json` | scripts: `build`, `lint` (`eslint … --fix`), `test` (`jest`), `test:cov`, `test:e2e`. `@nestjs/axios ^4`, `class-validator ^0.14`, `mongoose ^8`, `flutterwave-node-v3` present but unused by the FW service. |
| `src/main.ts` | `app.set('trust proxy', Number(process.env.TRUST_PROXY) \|\| 1)` at `:223-226`; global `ValidationPipe({whitelist, forbidNonWhitelisted, transform})` `:283-289`; global `AllExceptionsFilter` `:302`; helmet + CORS; **no `setGlobalPrefix`** → routes are exactly as declared. |
| `.env` | `BACK_URL=http://localhost:3002` (prod value commented: `https://app.digikuntz.com`), `FRONT_URL`, `TRUST_PROXY=1`, `NODE_ENV=development`. |
| `src/flutterwave/flutterwave.controller.ts` | `@Controller('fw')` `:41`. `POST direct-charge` `:195-252` (JWT, `@Body() data: any` → ValidationPipe bypass, `network = String(method.code).toUpperCase()` `:243`). `POST webhook` `:464-477` `@HttpCode(200)`, public. `GET verify-payin/:txRef` `:373`, `GET verify-close-payin/:txRef` `:386`. |
| `src/flutterwave/flutterwave.service.ts` | `setCredentials` `:99`, `loadDbCredentials` `:108-136` (loads gateway by currency/gatewayId, decrypts, calls `payinService.setCredentials`), `authHeader` `:166`, `createPayin` (hosted) `:651-748`, `createPaystackPayin` `:750`, `createMpesaPayin` `:853`, `getCountryForCurrency` `:913`, `validateDirectChargePayload` `:926-987`, `directMobileMoneyCharge` `:989-1058`, `createDirectCharge` `:1060-1129`, `verifyPayin` `:1221-1292`, `verifyAndClosePayin` `:1294-1408`, `repairInvoiceFinalizationByTxRef` `:1438-1460`, `reconcileSuccessfulPayins` `:1468-1489`, `processSuccessfulPayin` `:1491`, `verifyWebhookPayin` `:2146-2228`. |
| `src/flutterwave/flutterwave-api.service.ts` | Clean per-currency transport. `getSecretKey/hasCredentials/assertCredentials`, private `authHeader(currency)` `:87`, private `request()` `:97-127` — **no timeout, no retry**. `verifyPayinById`, `verifyPayinByReference`, transfers. |
| `src/flutterwave/flutterwave-error.util.ts` | `sanitizeFlutterwaveError` — maps upstream 401 → 502, HTML → `FW_UPSTREAM_5XX`. |
| `src/flutterwave/flutterwave-api.service.spec.ts` | The canonical mocking style: `http = { request: jest.fn() }` returning `of(...)` / `throwError(() => axiosError(status, data))`; `gatewayLoader = { getConfig: jest.fn() }`; `Test.createTestingModule`; helper `sentCall()` / `capture()`. |
| `src/flutterwave/flutterwave.module.ts` | Provides **its own** `PayinService` `:101` + `TransactionService` `:103`; imports `PaymentModule` via `forwardRef` `:69` (for `GatewayLoaderService`), `PaymentMethodModule` `:68`, `Payin`/`Transaction`/`Gateway` schemas `:79-94`; exports `FlutterwaveService, FlutterwaveApiService` `:113`. **Does not import `IdempotencyModule` or `DistributedLockModule`.** |
| `src/payin/payin.module.ts` | Provides a **second** `PayinService` `:90` + `PayinCron` `:91`; imports `FlutterwaveModule` via `forwardRef` `:62`; `DistributedLockModule` `:73`; exports `PayinService` `:102`. |
| `src/payin/payin.service.ts` | Shared mutable creds `fwSecret/fwPublic/secretHash` `:60-64`, `setCredentials` `:84-93`, `generateTxRef` `:101`, `normalizeKesMsisdnStrict` `:142-162` (KES-only), `initPayin` `:228-262` (writes undeclared `meta`), `createPayin` (HOSTED `/v3/payments`) `:265-321`, dead `createPaymentRequestPayin` `:323-332` + `createFlutterwaveMobileMoneyRequest` `:334-414`, `createMpesaPayin` `:491-562`, `createPaystackPayin` `:564-587`, `findPending` `:864-869` (`{status: PayinStatus.PENDING}`), `hasExpiredInMinutes` `:931`, `updatePayinStatus` `:958`, `updatePayin` `:964`, `verifyPayin` `:983-1050`, `handleVerifyPayin` `:1053`, `handleMpesaStkCallback` `:1064`, `verifyWebhook` `:1168-1199`. |
| `src/payin/payin.schema.ts` | `PayinStatus`, `PayinProvider`; `txRef` **required+unique** `:34`; `status` `@Prop({default:'PENDING'})` `:52` (**invalid enum value**); **no `error` field**; **no `meta` field**; indexes `{status,createdAt}` `:69`, `{transactionId}` `:70`. |
| `src/payin/payin.dto.ts` | `CreatePayinDto` (`channel` `@IsIn([...])`, optional `txRef`, `mobileMoney`). |
| `src/payin/payin.cron.ts` | 10 s locked loop `:17-40` calling `fw.verifyPayin` / `fw.verifyAndClosePayin` (`480` min close); 15 min `reconcileSuccessfulPayins` `:48`. |
| `src/payin/payin.controller.ts` | `GET get-txRef/:txRef` `:107-114` → `fw.repairInvoiceFinalizationByTxRef` — **public, no guard**. `/payin/webhook` commented out `:70-105`. |
| `src/transaction/transaction.schema.ts` | `TStatus`; `txRef` `:70`, `paymentMethod` `:76`, `flwTxId` `:233`, `statusChanges` `:235`, index `{flwTxId}` `:252`. |
| `src/transaction/transaction.service.ts` | `TRANSACTION_STATUS_FROM` `:45-75`; `updateTransactionStatus` `:881-943` (idempotent no-op on illegal transition); `claimTransactionForSuccessfulPayin` `:1377-1401`; `updateTransactionFlwTxId` `:1419-1433`; `createTransaction` `:1506`; `validateTransactionLimit` `:1665`. |
| `src/transaction/transaction.cron.ts`, `src/payment-request/payment-request.cron.ts` | 1 min / 15 s crons — untouched by this plan. |
| `src/gateway/gateway.schema.ts` | **`currency` enum is `['XAF','NGN','KES']` only** `:34`. |
| `src/payment/gateway-loader.service.ts` | In-memory `cache: Map<currency, GatewayConfig>`, **never invalidated** (`reloadConfig` exists but is never called); `loadAllConfigs()` exists and is exported. |
| `src/payment/payment.module.ts` | exports `GatewayLoaderService` `:21`. |
| `src/common/idempotency/idempotency.service.ts` | `processKey(key, fn)` — returns the stored response on replay, 11000-safe. |
| `src/distributed-lock/distributed-lock.service.ts` | `acquire/release/withLock(key, ttlMs, fn)`, 11000-based. |
| `src/invoice/invoice.controller.ts` | `POST :id/pay` `:88-93`, `@HttpCode(200)`, `ValidationPipe`, **public**. |
| `src/invoice/invoice.dto.ts` | `InitiateInvoicePaymentDto` `:90-106`. |
| `src/invoice/invoice.service.ts` | `initiatePayment` `:419-511`: PAYING-reuse branch `:432-453`, transaction create, `flutterwaveService.createPayin` `:482`, reads `payinResult?.redirect_url \|\| .link \|\| .url` `:486`, `handlePaymentSuccess` `:517-549`. |
| `src/payment-request/payment-request.service.ts` | `createCurrentUserPaymentRequest` `:64-147` (currency gate `XAF\|NGN\|KES` `:74`, `createFlutterwaveMobileMoneyRequest` never used here — it calls `createPayin`), reads only `initResp?.transactionId` `:128`. |
| `src/payment-request/create-payment-request.dto.ts` | `mobile_money.provider` is `@IsNotEmpty` `:27`. |
| `src/payment-request/payment-request.controller.ts` | `@Controller('payment-request')`, JWT, `@UsePipes(ValidationPipe)`. |
| `src/flutterwave/flutterwave.controller.ts:195` + `src/dev/dev.controller.ts:411-486` + `src/dev/dev.service.ts:563-712` | The three callers of the direct-charge path. `dev` is already wrapped in `IdempotencyService.processKey` `:472`. |
| `src/payment-method/payment-method.service.ts` | `findByCode(code)` `:87-92` — **no currency filter**, `populate('countryId')`. |

Frontend `/Users/flambel/Documents/GitHub/paymentGateway` (Angular 18):

| File | What it told us |
|---|---|
| `src/app/invoice-pay/invoice-pay.component.ts` | `pay()` `:103-140` — hard-fails on empty checkout URL `:128-131`. `openCheckout` `:142-158`, `startPayinPolling` 5 s `:160`, `startStatusPolling` 10 s `:174`, `checkStatus` `:231-242` (vocabulary `successful\|success`). |
| `src/app/invoice-pay/invoice-pay.component.html` | pay modal `:255-296`; submit button spinner keyed on `paying` `:289-293`. |
| `src/app/core/services/invoice/invoice.service.ts` | `initiatePayment(id, {payerName,payerPhone,payerEmail,redirectUrl})` `:100-102`; `getPublic(id,{silent})` `:93-98`. |
| `src/app/feature-module/payment-request/payment-request-create/payment-request-create.component.ts` | form `:101-107`; `updatePhoneValidator` = `required` only `:188-192`; `mapProviderToBackend` `:194-201` → `momo\|om\|atl\|m-pesa`; payload `:238-248`; success handler `:260-281`; `startPolling` bails without `transactionId` `:296-306`; `handleRequest` bails without `redirect_url` `:322-332`; `checkStatus` transaction vocabulary `:334-371`. |
| `payment-request-create.component.html` | result screen `:170-220`: `loader.gif`/`paymentDone.gif`/`tfailed.gif`, **hardcoded French**. |
| `src/app/services/field-validation/field-validation.service.ts` | `normalizePhoneDigits` `:126`, `isValidPhoneForCountry` `:130`, `isValidOperatorPhone` (OM/MTN 237, MPESA 254) `:149-171`, `operatorPhoneValidator` `:186`. |
| `src/app/services/payment/payment.service.ts` | `status` vocabulary `:21-35` (`transaction_payin_*`), `getPayinByTxRef` `:100-106`, `getTransactionData` `:340`. |
| `src/assets/i18n/fr.json` | `invoice.*` ~`:1725-1800` (`paymentStartError`, `paymentInProgress`, `txPending`, `payerPhone`, `proceedToPayment`…); `paymentRequest.*` ~`:1075-1120` incl. `status.{pending,success,failed,canceled}`. |

### Existing patterns to follow

- **Backend transport**: only `FlutterwaveApiService` may know FW base URLs / auth headers; all new HTTP goes through its private `request()`, with per-currency credentials resolved from `GatewayLoaderService` (never shared mutable state).
- **Backend errors**: `HttpException({ message, details?, code? }, status)`; upstream FW failures mapped by `flutterwave-error.util.ts`.
- **Backend logging**: `private readonly logger = new Logger(X.name)`; **never log secrets/tokens/hashes**.
- **Backend unit tests**: `Test.createTestingModule` + mock the Mongoose model and `HttpService` exactly as `flutterwave-api.service.spec.ts` does.
- **Frontend**: `takeUntil(this.destroy$)` + `setInterval` polling; `ToastrService`/`ToastService`; `TranslateService` with `| translate`; `FieldValidationService` for phone/amount validators.
- **Docs**: `docs/` exists; `docs/plans/` did not exist and is created by this plan.

### Constraints

- NestJS 11 / Mongoose 8 / Angular 18 (verified from manifests — do not assume other APIs).
- FW charge contract: `POST /v3/charges?type=mobile_money_franco`; `amount` int ≥ 100; `currency` **XAF/XOF only** for franco; `authorization_code` mandatory for **BF + ORANGEMONEY**.
- `Gateway.currency` enum is `['XAF','NGN','KES']` → **XOF has no gateway row** (hard blocker for XOF, see Open Questions).
- Zero regression on: hosted flow, `/dev/direct-charge`, paystack/mpesa paths, transaction transition table, the two-`PayinService` DI arrangement.
- No `mongodb-memory-server` — persistence is proven by unit tests with mocked models plus manual sandbox checks.

---

## Goal

Make **direct mobile-money charge** the primary path for (1) invoice payment, (2) payment-request and (3) `POST /fw/direct-charge`, deducing the mobile-money network from the payer's phone-number prefix across several countries/currencies, persisting the attempt **before** charging so the unique `txRef` guarantees idempotency, and delivering reliable status synchronisation (hardened webhook + existing cron as safety net) so the frontend can show a loader and then the final status — while keeping the existing hosted (`redirect_url`) flow selectable with zero regression.

**Success criteria**

1. For a XAF + Cameroonian number in the direct path, the backend creates `Transaction(PAYINPENDING)` → `Payin(status:'pending')` → **one** `POST /v3/charges?type=mobile_money_franco` with a resolved `country`+`network` — and **no** `POST /v3/payments`.
2. A retried request with the same idempotency key produces **zero** additional FW charges.
3. `POST /fw/webhook` handles `charge.completed` with `successful` **and** `failed`, is idempotent, persists `flwTxId`, always answers 200 for a valid signature, and never logs secrets.
4. `PayinCron` discovers every direct-charge payin (they carry literal `status:'pending'`), and terminalises the transaction at the latest after `DIRECT_CHARGE_CLOSE_MINUTES`.
5. The invoice payer sees a loader after initiation, then a final success/failure state, with **no** `paymentStartError` for the direct path.
6. The payment-request wizard lets the payer pick mobile-money (with network deduced) vs card (`card` disabled/"coming soon") and no longer hangs on a missing `redirect_url`/`transactionId`.
7. `DIRECT_CHARGE_ENABLED=false` restores the pre-change behaviour for all three entrypoints without a code change.

---

## Out of scope

- Building the **card** integration (only the selectable-but-disabled UI affordance and a non-breaking backend field are in scope).
- Implementing the OTP / `authorization_code` second step (**V1 without OTP**, by product decision). The BF+ORANGEMONEY restriction is documented and fails fast instead of being implemented.
- Reviving `POST /payin/webhook` (explicitly forbidden) or `PayinService.createPaymentRequestPayin` (dead code — deletion is a separate cleanup, not part of this change).
- Changing the webhook signature scheme to HMAC (FW sends the raw hash; the current plain equality is correct).
- New currencies/gateways beyond what the `Gateway` collection already holds (XOF is called out as an open question, not silently half-built).
- Rewriting `FlutterwaveService` (≈2900 lines) or introducing a new module boundary.

---

## Tasks

> Every task is additive and independently shippable unless marked. `depends on` lists hard prerequisites only.

### Stage 0 — Safety rails (no behaviour change)

**0.1 Add the feature flags and document them**
- files: `.env` (add `DIRECT_CHARGE_ENABLED=false`, `DIRECT_CHARGE_FALLBACK_HOSTED=true`, `DIRECT_CHARGE_CLOSE_MINUTES=30`), `.env.example`/`README.md` (document them), `src/flutterwave/direct-charge.config.ts` (new: `isDirectChargeEnabled(cfg)`, `isHostedFallbackEnabled(cfg)`, `getDirectChargeCloseMinutes(cfg)` reading `ConfigService`).
- proof: `direct-charge.config.spec.ts` — defaults when unset (`false`, `true`, `30`) and parsing of `'true'/'1'`.
- depends on: —
- **Rollback lever for the whole plan.**

**0.2 Backend test baseline recorded**
- files: none. Run `npx jest --silent` and record `26 passed / 27` and the 3 known failing suites (`plans.service.spec.ts`, `plans.controller.spec.ts`, `common/upload-dir.util.spec.ts`).
- proof: the recorded baseline; every later stage must not add a 4th failing suite.
- depends on: —

### Stage 1 — Pure resolver + charge-payload builder (no wiring)

**1.1 Phone-prefix → network resolver**
- files: `src/flutterwave/mobile-money-network.util.ts` (new).
- Public surface (pure, zero DI — trivially unit-testable):
```ts
export type ChargeType =
  | 'mobile_money_franco' | 'mobile_money_nigeria' | 'mpesa'
  | 'mobile_money_ghana'  | 'mobile_money_uganda'  | 'mobile_money_rwanda';

export interface MobileMoneyNetworkRule {
  country: string;        // ISO2: CM, SN, BF, CI, ML, GH, KE, RW, UG, TZ, ZM, NG
  currency: string;       // XAF | XOF | GHS | KES | RWF | UGX | TZS | ZMW | NGN
  dialCode: string;       // '237', '225', '221', '226', '223', ...
  prefixes: string[];     // NATIONAL significant prefixes, WITHOUT the dial code
  network: string;        // FW vocabulary: MTN | ORANGEMONEY | MOOV | WAVE | MPESA | ...
  chargeType: ChargeType;
  requiresAuthorizationCode?: boolean; // true for BF + ORANGEMONEY
}

export const MOBILE_MONEY_NETWORKS: MobileMoneyNetworkRule[];

export interface ResolveNetworkInput {
  phone: string;
  currency?: string;   // hint when the number has no dial code
  country?: string;    // hint (ISO2) — e.g. the user's country
  network?: string;    // explicit override from the caller
}

export interface ResolvedNetwork {
  country: string; currency: string; network: string;
  chargeType: ChargeType; msisdn: string; requiresAuthorizationCode: boolean;
}

/** @throws {MobileMoneyNetworkError} */
export function resolveMobileMoneyNetwork(input: ResolveNetworkInput): ResolvedNetwork;

export class MobileMoneyNetworkError extends Error {
  constructor(readonly code: 'UNSUPPORTED_CURRENCY'
    | 'UNSUPPORTED_COUNTRY' | 'NETWORK_NOT_RESOLVED'
    | 'AUTHORIZATION_CODE_REQUIRED' | 'AMBIGUOUS_NUMBER', message: string) { super(message); }
}
```
- **Algorithm** (order matters):
  1. `digits = phone.replace(/\D/g,'')`.
  2. `country = tokenizeCountry(digits, ccyHint)` — longest dial-code match first (`237` before `23`), then the `currency`/`country` hints.
  3. Strip the dial code → `national`. Validate the national length for that country (table field `nationalLength: [min,max]`) → `AMBIGUOUS_NUMBER` on mismatch (prevents a `+237` number being matched against an SN rule).
  4. **Longest-prefix match** over the rules of that country only, `prefixes` sorted descending by length → deterministic boundary handling.
  5. If no rule matches but `input.network` is present **and** belongs to the country's rule set → accept it (explicit override), else `NETWORK_NOT_RESOLVED`.
  6. If `rule.requiresAuthorizationCode` → `AUTHORIZATION_CODE_REQUIRED` (V1 has no OTP step).
  7. `msisdn = dialCode + national` (country-prefixed, digits only).
- **Table content** — encode exactly the operators given in the brief, one rule per (country, network); `prefixes` to be filled from the operator allocation tables during implementation and **verified against the FW sandbox** (each prefix listed in the spec tests becomes a contract):
  - CM/XAF: MTN, ORANGEMONEY · SN/XOF: ORANGEMONEY, FREE, WAVE · BF/XOF: ORANGEMONEY (`requiresAuthorizationCode`), MOOV/Mobicash · CI/XOF: MTN, ORANGEMONEY, WAVE · ML/XOF · GH/GHS: MTN, VODAFONE, AIRTELTIGO · NG/NGN: MTN, AIRTEL, GLO, 9MOBILE · KE/KES: MPESA · RW/RWF: AIRTEL, MTN · UG/UGX: AIRTEL, MTN · TZ/TZS: AIRTEL, TIGO, HALOPESA · ZM/ZMW: AIRTEL, MTN, ZAMTEL.
- **`normalizeKesMsisdnStrict` is NOT touched.** Invariant to assert in a test: the resolver **has no KES-to-Paystack/M-Pesa rule**; `currency === 'KES'` must be short-circuited *before* the resolver is ever called (see 5.2), so `normalizeKesMsisdnStrict` remains the single KES authority.
- proof: `src/flutterwave/mobile-money-network.util.spec.ts` — see Test plan 9.1.
- depends on: —

**1.2 Charge-payload builder (pure)**
- files: `src/flutterwave/mobile-money-charge.builder.ts` (new).
```ts
export interface BuildChargeInput {
  txRef: string; amount: number; currency: string; phone: string;
  email: string; fullname?: string;
  country?: string; network?: string;   // explicit overrides
  clientIp?: string; deviceFingerprint?: string;
  flow: 'direct_charge' | 'payment_request' | 'invoice';
  meta?: Record<string, unknown>;
}
export interface BuiltCharge {
  chargeType: ChargeType;
  body: Record<string, any>;
  resolved: ResolvedNetwork;
}
/** @throws {HttpException} 400 with { code } for every validation failure */
export function buildMobileMoneyCharge(input: BuildChargeInput): BuiltCharge;
```
- Rules:
  - `amount = Math.round(Number(amount))`; must be finite and `>= 100` → else 400 `{ code: 'AMOUNT_BELOW_MIN' }` (FW contract).
  - `currency` upper-cased and must be in `DIRECT_CHARGE_CURRENCIES = ['XAF','XOF','NGN','KES','GHS','UGX','RWF','TZS','ZMW']` → else 400 `UNSUPPORTED_CURRENCY`.
  - `phone_number`, `country`, `network`, `chargeType` all come from `resolveMobileMoneyNetwork` — **never** from a currency→country map. `getCountryForCurrency` (`flutterwave.service.ts:913`) is left in place for the hosted/legacy path but is **no longer used by the direct path**.
  - `client_ip`: included only when `clientIp` is a non-empty string.
  - `device_fingerprint`: included only when provided.
  - `meta = { app:'digikuntz-payments', flow, ...meta }`, plus a **new** `authorizationCodeApplied: false` marker so the webhook/reconciliation can tell V1 charges apart after the OTP step lands.
  - `authorization_code` is never sent in V1.
- proof: `src/flutterwave/mobile-money-charge.builder.spec.ts` — see 9.2.
- depends on: 1.1

### Stage 2 — Persistence schema forward-compat (behaviour-neutral)

**2.1 Fix the `Payin` schema**
- files: `src/payin/payin.schema.ts`.
- Changes (all additive/compat-safe):
  - `@Prop({ default: PayinStatus.PENDING }) status: PayinStatus;` — replaces the literal `'PENDING'` so new documents are visible to `findPending`.
  - Add `@Prop({ type: Object }) error?: any;` — `error:` is written at `payin.service.ts:1040` (`verifyPayin`) and in `verifyPayinByTxRef`; both are currently dropped by strict mode. Declaring the path keeps the failure reason instead of discarding it.
  - Add `@Prop({ type: Object, default: {} }) meta?: Record<string, unknown>;` — `initPayin` `:237` already writes it.
  - Add `@Prop() userRef?: string;` **only if** 5.2 needs it; otherwise omit.
- proof: `src/payin/payin.schema.spec.ts` — assert `PayinSchema.path('status').defaultValue === 'pending'`, and that `error`/`meta` are declared paths.
- depends on: —
- **Note**: documents already stored with `status:'PENDING'` stay invisible to the cron. A one-shot repair (`updateMany({status:'PENDING'}, {status:'pending'})`) is an **upgrade step**, not a code change — list it in the deploy runbook (Stage 10).

### Stage 3 — Transport: the charge call goes through `FlutterwaveApiService`

**3.1 Add a timeout seam to `request()`**
- files: `src/flutterwave/flutterwave-api.service.ts`.
- `request(config)` gains `timeoutMs?: number` and passes `timeout: config.timeoutMs ?? 30_000` to `this.http.request(...)`.
- **No retry** is added to `request()` — a `POST /v3/charges` is not idempotent at the transport layer. (State this in a code comment.)
- proof: extend `flutterwave-api.service.spec.ts` — assert `sentCall().timeout === 30_000` by default and `=== 5_000` when overridden.
- depends on: —

**3.2 Add `chargeMobileMoney`**
- files: `src/flutterwave/flutterwave-api.service.ts`.
```ts
/**
 * POST /v3/charges?type={chargeType} — direct mobile-money charge.
 * Credentials are resolved per currency; the call is NOT retried (non-idempotent).
 */
async chargeMobileMoney(
  chargeType: ChargeType,
  body: Record<string, any>,
  currency: string,
): Promise<any>;   // returns the FULL envelope: { status, message, data, meta }
```
- implementation: `this.request({ method:'post', path:`/charges?type=${chargeType}`, currency, data: body, timeoutMs: 30_000, fallbackMessage:'Flutterwave direct charge failed' })`.
- **Why this is the fix for BUG 1 + BUG 3**: `authHeader(currency)` calls `getSecretKey(currency)` → `GatewayLoaderService` → no stale shared `fwSecret`, no 401/502, no `loadDbCredentials` ordering hazard, and concurrency across currencies is safe.
- proof: extend `flutterwave-api.service.spec.ts` — URL is `${BASE}/charges?type=mobile_money_franco`, header is the currency secret, the upstream 401→502 mapping and the no-credentials short-circuit both hold. Response returns the **unwrapped envelope** (`meta.authorization.redirect_url` must remain reachable).
- depends on: 3.1

### Stage 4 — `PayinService` persistence primitives

**4.1 `createPendingPayin`**
- files: `src/payin/payin.service.ts`.
```ts
async createPendingPayin(dto: {
  txRef: string; amount: number; currency: string;
  customerEmail: string; customerName?: string; customerPhone?: string;
  transactionId: string | mongoose.Types.ObjectId; userId?: string;
  channel?: string; provider?: PayinProvider; redirectUrl?: string;
}): Promise<PayinDocument>;
```
- **Explicitly writes `status: PayinStatus.PENDING`** (never relies on the schema default).
- Writes `channel` and `provider` (default `FLUTTERWAVE`).
- 11000 → returns the existing document for that `txRef` (`findOne`), so a replay is a no-op rather than a crash. Mirrors the existing `initPayin` pattern `:247-261`.

**4.2 `attachChargeResult`**
```ts
async attachChargeResult(txRef: string, patch: {
  flwTxId?: string | number; raw?: any; status?: PayinStatus;
  channel?: string; redirectUrl?: string | null;
}): Promise<PayinDocument | null>;
```
- `findOneAndUpdate({ txRef }, {...}, { new: true })`; **never** downgrades a terminal status (`$nin`-guard on the filter when a non-terminal patch is applied).

**4.3 `findReusablePending`**
```ts
async findReusablePending(txRef: string): Promise<PayinDocument | null>;
```
- Returns the doc when it exists, is `pending`, and already has `flwTxId` (i.e. a charge already reached FW) → the caller must not re-charge. Returns `null` otherwise (including terminal states).

**4.4 `findPendingDirectCharges(limit)`** (read-only helper for the cron)
```ts
async findPendingDirectCharges(limit = 100): Promise<PayinDocument[]>;
```
- `{ status: PayinStatus.PENDING, 'raw.flow': 'direct_charge' }` — lets the cron apply a short close window (7.3) without touching the existing `findPending` contract.

- proof: `src/payin/payin.service.spec.ts` (new) — mocked `payinModel` (`{ create, findOne, findOneAndUpdate, find, aggregate }` as jest fns, chained `.lean().exec()` stubs as in the real calls). Assert: explicit `status:'pending'` passed to `create`; 11000 returns the existing doc; `attachChargeResult` persists `flwTxId`+`raw`; `findReusablePending` returns `null` for terminal docs.
- depends on: 2.1

### Stage 5 — The direct-charge orchestrator (the core fix)

**5.1 Rewrite `FlutterwaveService.directMobileMoneyCharge`**
- files: `src/flutterwave/flutterwave.service.ts`.
- Delete the body of `:989-1058` and the private `validateDirectChargePayload` `:926-987`; replace with a thin delegation:
```ts
async directMobileMoneyCharge(dto: {
  amount: number; currency: string; phone: string; email: string;
  name?: string; network?: string; country?: string;
  flow: 'direct_charge' | 'payment_request' | 'invoice';
  clientIp?: string; deviceFingerprint?: string; txRef: string;
  meta?: Record<string, unknown>;
}): Promise<{ enrollment: any; built: BuiltCharge }>            // (see 5.2 for the consumer)
```
which calls `buildMobileMoneyCharge(...)` (1.2) then `this.flutterwaveApi.chargeMobileMoney(built.chargeType, built.body, currency)`.
- `getCountryForCurrency` `:913-924` is **kept** (still used by the legacy/other paths) but must no longer be reachable from the direct path — assert with a spy in 9.4.
- Inject `FlutterwaveApiService` into `FlutterwaveService`'s constructor (same module → no DI change beyond the provider list, which already contains `FlutterwaveApiService` `flutterwave.module.ts:100`).

**5.2 Rewrite `FlutterwaveService.createDirectCharge` with the correct order**
- files: `src/flutterwave/flutterwave.service.ts`.
- New sequence (this is the **persistence-order fix**):
  1. `validateTransactionLimit(...)` — unchanged.
  2. Resolve the currency & payment method; `feeRate` — unchanged.
  3. **KES short-circuit**: `if (currency === 'KES') return this.createPaystackPayin(...) // existing path, untouched` (never touch `normalizeKesMsisdnStrict`).
  4. `txRef = this.payinService.generateTxRef('txDirect')`.
  5. `savedTransaction = transactionService.createTransaction({... status: TStatus.PAYINPENDING ...})` — unchanged.
  6. **NEW — persist first**: `payinService.createPendingPayin({ txRef, amount: paymentWithTaxes, currency, customerEmail, customerName, customerPhone, transactionId: savedTransaction._id, userId, channel: 'mobile_money' })`.
  7. **NEW — reuse guard**: `const reusable = await payinService.findReusablePending(txRef); if (reusable) return this.buildDirectChargeResponse(reusable, savedTransaction, 'pending')` (no second charge).
  8. `clientIp = req.ip` (threaded down from the controller, see 6.1) — **not** computed inside the service.
  9. `const charge = await this.directMobileMoneyCharge({..., flow:'direct_charge', clientIp, deviceFingerprint, txRef})`.
  10. **NEW — persist the result**: `payinService.attachChargeResult(txRef, { flwTxId: charge.data?.id, raw: charge, status: <mapped> , redirectUrl: charge.meta?.authorization?.redirect_url })`, then `transactionService.updateTransactionFlwTxId(String(savedTransaction._id), String(charge.data?.id))`.
  11. **DELETE the `this.payinService.createPayin({...})` call at `:1107-1117`** — this is BUG 2 (a hosted `/v3/payments` session was being created for every "direct" charge). The direct path must create **no** hosted session.
  12. Return the response shape of 8.3.
- **Error handling**: wrap step 9; on failure call `payinService.attachChargeResult(txRef, { status: PayinStatus.FAILED, raw: { error: <sanitised> } })` and rethrow the mapped `HttpException` (`mobile-money-charge.builder` throws 400 for validation; `FlutterwaveApiService` throws 400/502 for upstream). The transaction deliberately stays `PAYINPENDING` — identical to the documented policy in `verifyPayin` `:1232-1258` — so an existing retry/relink flow keeps working.
- **Optional hosted fallback** (flag `DIRECT_CHARGE_FALLBACK_HOSTED=true`): only if the failure is a **pre-charge** validation error whose code is `UNSUPPORTED_COUNTRY`/`NETWORK_NOT_RESOLVED`/`AUTHORIZATION_CODE_REQUIRED`, re-run the legacy hosted path (`this.createPayin(transactionData, userId)` with `transactionType` reset) and return it with `mode:'hosted'`. **Never fall back after any FW charge call has been issued.**
- **Which `PayinService` instance**: this is `this.payinService` on `FlutterwaveService` = the **`FlutterwaveModule`** instance (`flutterwave.module.ts:101`) — the only instance that ever receives `setCredentials` (and therefore `secretHash`). All new methods are added to the shared `PayinService` **class**, but they are only ever invoked through the FW-module instance, or (cron) through the `PayinModule` instance for DB reads. Both point at the same Mongoose model, so state is shared; the only per-instance state was credentials, and the charge path now resolves them per-currency through `FlutterwaveApiService`. **Do not** inject `PayinService` from `PayinModule` into anything in `FlutterwaveModule`.
- proof: `src/flutterwave/flutterwave.service.direct-charge.spec.ts` (new). Mocks: `payinService` (`createPendingPayin`, `findReusablePending`, `attachChargeResult`, `createPayin`), `transactionService`, `flutterwaveApi`, `paymentMethodService`, `gatewayModel`, `config`. Assertions: call order is `createTransaction` → `createPendingPayin` → `chargeMobileMoney` → `attachChargeResult`; `payinService.createPayin` is **never** called; `flwTxId`/`raw` are persisted; a reused pending payin produces **no** `chargeMobileMoney` call.
- depends on: 1.2, 3.2, 4.1-4.3

### Stage 6 — Endpoint wiring

**6.1 `POST /fw/direct-charge` with a real DTO + `client_ip`**
- files: `src/flutterwave/dto/direct-charge.dto.ts` (new), `src/flutterwave/flutterwave.controller.ts:195-252`.
```ts
export class DirectChargeDto {
  @Type(() => Number) @IsNumber() @Min(100) estimation: number;

  @IsString() @IsIn(DIRECT_CHARGE_CURRENCIES) currency: string;

  @IsString() @IsNotEmpty() phone: string;

  @IsEmail() email: string;

  @IsOptional() @IsString() name?: string;

  @IsOptional() @IsString() network?: string;        // explicit override

  @IsOptional() @IsString() paymentMethodCode?: string;

  @IsOptional() @IsIn(['mobile_money','card'])
  paymentMethod?: 'mobile_money' | 'card';           // card → 400 in V1, field reserved

  @IsOptional() @IsIn(['direct','hosted'])
  mode?: 'direct' | 'hosted';                        // hosted = legacy fallback

  @IsOptional() @IsString() deviceFingerprint?: string;
}
```
- Controller:
```ts
@Post('direct-charge')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))   // NOT forbidNonWhitelisted — see Risks R8
async createDirectCharge(@Body() data: DirectChargeDto, @Req() req) {
  if (data.paymentMethod === 'card') {
    throw new BadRequestException({ message: 'Card payments are not available yet', code: 'PAYMENT_METHOD_NOT_SUPPORTED' });
  }
  // resolve feeRate + network from paymentMethodCode exactly as today (:219-246)
  return this.fw.createDirectCharge(
    { ...data, invoiceTaxes: feeRate, network: networkOverride, clientIp: req.ip, userId: req.user._id },
    req.user._id,
  );
}
```
- **`client_ip` source**: `req.ip`. `main.ts:223-226` sets `trust proxy` to `TRUST_PROXY` (`.env` → `1`), so Express resolves `req.ip` from `X-Forwarded-For` when the app runs behind the documented nginx/Apache reverse proxy, and falls back to the socket address otherwise. This is preferred over reading `x-forwarded-for` manually (one trusted hop, no spoofable raw header). The value is **only** passed through to FW, never logged.
- **`deviceFingerprint` decision**: FW uses `device_fingerprint` for fraud scoring; there is no native device SDK in this stack. Pragmatic choice = a **client-generated stable UUID persisted in `localStorage`**, sent as `deviceFingerprint`, and **optional**. If absent, the field is omitted entirely (FW accepts that). Rationale: zero new dependencies, no PII, no server-side PII derivation, no regression for existing API integrators (e.g. `/dev/direct-charge`) who will never send it. Rejected alternatives: hashing `userId+email` server-side (weak, PII-derived, non-stable across devices) and running a JS fingerprinting library (new dependency, privacy surface, and unavailable for API clients).
- proof: `direct-charge.dto.spec.ts` — `amount: 99` rejected (`Min(100)`), unknown field stripped not rejected, `paymentMethod:'card'` → 400 `PAYMENT_METHOD_NOT_SUPPORTED`.
- depends on: 5.2

**6.2 `POST /invoices/:id/pay` selects direct vs hosted**
- files: `src/invoice/invoice.dto.ts`, `src/invoice/invoice.service.ts:419-511`, `src/invoice/invoice.controller.ts:88-93`.
- DTO additions (all optional → zero regression):
```ts
@IsOptional() @IsIn(['mobile_money','card']) paymentMethod?: 'mobile_money'|'card';
@IsOptional() @IsIn(['direct','hosted'])     mode?: 'direct'|'hosted';
@IsOptional() @IsString()                    deviceFingerprint?: string;
@IsOptional() @IsString() @IsIn(DIRECT_CHARGE_CURRENCIES) currency?: string;
```
- Controller passes `req.ip` into the service (new param) for `client_ip`.
- Service: the PAYING-reuse branch `:432-453` is **preserved**, but it must now also tolerate direct charges (no link):
  - if the existing transaction is a direct charge → return `{ status:'pending', reused:true, mode:'direct', transactionId, txRef, amount, currency, redirect_url: null }`;
  - if hosted → unchanged (`redirect_url: link`).
- Selection rule: `mode === 'hosted'` → existing path (`flutterwaveService.createPayin`) unchanged. `mode === 'direct'` **or** (`mode` absent **and** `DIRECT_CHARGE_ENABLED` and `paymentMethod !== 'card'` and currency is direct-capable) → the new direct path: create the `Transaction` (`TransactionType.INVOICE`) then `createDirectCharge(...)`; persist `invoice.paymentLink = ''`, `invoice.transactionId`, payer fields, `await invoice.save()`.
- `handlePaymentSuccess` `:517-549` is untouched — the webhook/repair path still drives the invoice to `PAYED`.
- proof: `src/invoice/invoice.service.spec.ts` (new) — hosted branch returns `redirect_url`; direct branch returns `redirect_url: null` and `mode:'direct'`; `DIRECT_CHARGE_ENABLED=false` always takes the hosted branch (flag-off regression test).
- depends on: 5.2, 6.1

**6.3 `POST /payment-request` selects direct vs hosted**
- files: `src/payment-request/create-payment-request.dto.ts`, `src/payment-request/payment-request.service.ts:64-147`, `src/payment-request/payment-request.controller.ts:72`.
- DTO: make `mobile_money.provider` `@IsOptional() @IsString()` (it is only meaningful for the legacy path), add `@IsOptional() @IsString() network?: string;`, add `@IsOptional() @IsIn(['mobile_money','card']) paymentMethod?: 'mobile_money'|'card'`. **Non-breaking**: every existing client sends `provider`.
- Service: currency gate `:74` stays `['XAF','NGN','KES']` for now (see Open Question Q1). Add the direct branch before `createPayin`:
  - `mode === 'direct'` (or `mode` absent + flag on) → reuse the SAME `transactionData` object (`:92-121`, unchanged, so `transactionType: PAYMENTREQUEST` and `commissionPayer` are preserved), then `flutterwaveService.createDirectCharge({... , flow:'payment_request', clientIp, deviceFingerprint, txRef}, userId)`.
  - The `paymentRequestModel.findOneAndUpdate` block `:128-144` (keyed on `transactionId`) is **unchanged** — it only needs `initResp.transactionId`, which the direct response still provides.
  - KES still routes through the existing paystack/mpesa path (`:87-89` `normalizeKesMsisdnStrict` untouched).
- proof: extend `payment-request.service.spec.ts` (new) — direct branch calls `createDirectCharge` and not `createPayin`; the PaymentRequest row is still upserted with `status: PENDING`; KES still calls `normalizeKesMsisdnStrict`.
- depends on: 5.2, 6.1

**6.4 `POST /dev/direct-charge` stays working**
- files: `src/dev/dev.service.ts:563-712`.
- Change: replace the hosted `this.payinService.createPayin({...})` `:687-697` with the new order (persist-then-charge happens inside `fwService.createDirectCharge`, so this call must be **removed**, not duplicated). Pass `flow:'direct_charge'` and `req.ip` through `dev.controller.ts:411-486` (already idempotency-wrapped `:472`).
- proof: `src/dev/dev.service.spec.ts` (new/extend) — `createDirectPayinTransaction` no longer calls `payinService.createPayin`; the idempotency wrapper still short-circuits a replayed key.
- depends on: 5.2

### Stage 7 — Webhook hardening + status synchronisation

**7.1 Make the webhook signature check correct across currencies**
- files: `src/payin/payin.service.ts:1168-1199`, `src/flutterwave/flutterwave.service.ts:108-136`.
- **Latent bug found during discovery**: `secretHash` is shared mutable state on the `PayinService` instance and is only populated by `loadDbCredentials`, which runs **only** on a charge/payin call for one currency. Consequences: (a) after a process restart, a webhook arriving before the first charge compares `verif-hash` against `''` → 401; (b) a webhook for a currency other than the last loaded one is rejected.
- Fix: inject `GatewayLoaderService` (already exported by `PaymentModule`, already imported by `FlutterwaveModule` via `forwardRef`) into the FW-module `PayinService`… **no** — that would require a constructor change on a class instantiated in two modules. Prefer the surgical fix: in `FlutterwaveService.verifyWebhookPayin` `:2146`, **before** delegating, call
  `await this.loadDbCredentials(body?.data?.currency || 'XAF')` **and** additionally accept the signature if it matches **any** active flutterwave gateway's `FLUTTERWAVE_SECRET_HASH` (collected via `gatewayLoader.loadAllConfigs()`). Implement the multi-hash check as a new `PayinService.verifyWebhookSignature(signature, candidates: string[])` used by `verifyWebhook`, keeping the legacy single-hash comparison as a fallback so nothing regresses.
- Keep **plain string equality** (FW sends the raw hash; HMAC would break every webhook).
- proof: `payin.service.spec.ts` — valid signature passes; wrong signature → `UnauthorizedException`; a signature matching a *non-primary* gateway hash passes when passed as a candidate.
- depends on: 4.1

**7.2 Handle success **and** failure, idempotently**
- files: `src/payin/payin.service.ts` `verifyWebhook` `:1168-1199`.
- New behaviour:
```
signature invalid                                   → throw UnauthorizedException (401)
event !== 'charge.completed'                        → { status:'ok' }            (200, unchanged)
data.status === 'successful'  → Payin.SUCCESSFUL  (existing $nin-guarded findOneAndUpdate, persist flwTxId + raw)
data.status === 'failed'      → Payin.FAILED      (same $nin guard, persist flwTxId + raw + error)
data.status === 'cancelled'   → Payin.CANCELLED   (same $nin guard)
data.status === 'pending'     → no write, refresh raw only
```
- The existing `status: { $nin: ['successful','failed','cancelled'] }` filter **is** the idempotency guarantee — a replayed webhook is a no-op. Keep it, and always write `flwTxId` and `raw`.
- **Always answer 200 for a valid signature**: `verifyWebhookPayin` must not throw after signature validation. Wrap the status handling in `try/catch`, log via `this.logger.warn(...)`, and still `return { status:'ok' }`. The controller already has `@HttpCode(200)` `:465`.
- **Never log secrets**: log only `{ event, txRef, flwStatus }`. Never `req.headers`, never the hash, never the raw body.
- proof: `payin.service.spec.ts` — success/failed/cancelled each map to the right `PayinStatus`; a second identical webhook writes nothing; unknown `txRef` returns 200 and does not throw; a bad signature throws 401.
- depends on: 7.1

**7.3 Terminalise the transaction for direct charges, without changing hosted behaviour**
- files: `src/flutterwave/flutterwave.service.ts` `verifyWebhookPayin` `:2146-2228`, `src/payin/payin.cron.ts`.
- Rule: **only** when `payin.raw?.flow === 'direct_charge' | 'payment_request' | 'invoice-direct'` (i.e. the payin was created by the direct path) does a `failed`/`cancelled` webhook also move the transaction to the terminal state, via `transactionService.updateTransactionStatus(transactionId, PAYINERROR | PAYINCLOSED)`. Hosted payins keep the current "stay `PAYINPENDING` so the user can retry the hosted link" policy (`verifyPayin.ts:1232-1258`) — **unchanged**.
- Why gated: the hosted flow deliberately keeps the transaction pending so a second attempt on the same link works; a direct charge has no reusable link, and the product decision (6) requires the frontend to see a final state promptly.
- Cron: add a short close window for direct charges — in `PayinCron.handleCron`, for payins flagged direct, use `DIRECT_CHARGE_CLOSE_MINUTES` (default 30) instead of `PAYIN_CLOSE_MINUTES` (480). The existing `findPending(100)` loop and the distributed lock stay; add a second locked pass over `findPendingDirectCharges(100)`. This is the **safety net** if the webhook is never configured or delivered.
- Confirm the discovery requirement: direct-charge payins **must** be created with the literal `status:'pending'` — guaranteed by 4.1 + 2.1. Add an explicit assertion in the spec.
- proof: `flutterwave.service.webhook.spec.ts` (new) — direct-charge failed webhook moves the transaction to `PAYINERROR`; hosted failed webhook leaves it `PAYINPENDING`; `payin.cron.spec.ts` — a direct payin older than `DIRECT_CHARGE_CLOSE_MINUTES` is closed, a fresh one is not.
- depends on: 7.2, 4.4

**7.4 Status mapping table (normative — implement exactly this)**
| FW `data.status` / event | → `PayinStatus` | → `TStatus` (direct) | → `TStatus` (hosted) | trigger |
|---|---|---|---|---|
| `charge.completed` / `successful` | `successful` | `PAYINSUCCESS` | `PAYINSUCCESS` | `processSuccessfulPayin` (claim, idempotent) |
| `charge.completed` / `failed` | `failed` | `PAYINERROR` | **unchanged** (`PAYINPENDING`) | webhook (7.3) / `verifyAndClosePayin` |
| `charge.completed` / `cancelled` | `cancelled` | `PAYINCLOSED` | **unchanged** (`PAYINPENDING`) | webhook (7.3) / `verifyAndClosePayin` |
| `charge.completed` / `pending` | `pending` | unchanged | unchanged | cron poll |
| no webhook, still `pending` past `DIRECT_CHARGE_CLOSE_MINUTES` | `cancelled` | `PAYINCLOSED` | (480 min) | `PayinCron` |
- Transition legality is enforced by `TRANSACTION_STATUS_FROM` `transaction.service.ts:45-75`; `PAYINSUCCESS` is only reachable from `INITIALIZED|PAYINPENDING|PAYINERROR|PAYINCLOSED` and is terminal. **No change to that table is required** — verify (do not edit) in the spec.

### Stage 8 — Frontend: invoice payment (loader + poll + method choice)

**8.1 Replace the hard-fail with the three-outcome handler**
- files: `src/app/invoice-pay/invoice-pay.component.ts`.
- `pay()` `:103-140` becomes:
```ts
next: (res) => {
  this.paying = false;
  this.txRef = res?.txRef || '';
  this.mode = res?.mode || 'hosted';
  const checkoutUrl = res?.redirect_url || res?.link || res?.url || res?.data?.link || res?.data?.url || '';
  if (checkoutUrl) { this.closePayModal(); this.openCheckout(checkoutUrl); return; }   // outcome (b)
  if (this.isTerminalFailure(res)) { this.showFailure(res); return; }                  // outcome (c)
  this.closePayModal(); this.startDirectChargeLoader();                                // outcome (a)
}
```
- New state: `paymentState: 'idle'|'awaiting'|'success'|'failed'|'cancelled' = 'idle'`, `paymentError = ''`.
- **Outcome (a) — pending/USSD push**: show the loader UI, start `startPayinPolling()` (5 s, existing `:160-165`) **plus** the existing 10 s silent invoice refresh `:174-177`.
- **Outcome (b) — FW returned `meta.authorization.redirect_url`** (see the FW contract: a "direct" charge may still return `mode:'redirecturl'`): the backend surfaces it as `redirect_url`, so this is literally the existing `openCheckout()` path `:142-158` — unchanged.
- **Outcome (c) — immediate/terminal failure**: `paymentState='failed'`, `paymentError = res?.message`, stop polling, no generic `paymentStartError` toast unless `txRef` is missing entirely.
- `checkStatus()` `:231-242`: keep the payin vocabulary but react to `successful`, `failed`, `cancelled` and stop polling on any terminal value:
```ts
const s = String(resp?.data?.status ?? resp?.data?.data?.status ?? resp?.status ?? 'pending').toLowerCase();
if (s === 'successful' || s === 'success') { this.paymentState='success'; this.stopPayinPolling(); this.refreshStatusSilently(); }
else if (s === 'failed')                 { this.paymentState='failed';  this.stopPayinPolling(); }
else if (s === 'cancelled')               { this.paymentState='cancelled'; this.stopPayinPolling(); }
```
- `refreshStatusSilently()` `:191-229` is unchanged and remains the authority for `invoice.status === 'payed'`.
- **Polling contract decision (invoice)**: keep `GET /payin/get-txRef/:txRef` → `FlutterwaveService.repairInvoiceFinalizationByTxRef`. Reasons: it is **public** (the invoice payer is unauthenticated), it already self-heals by calling `processSuccessfulPayin`, and it returns the payin whose `.status` is exactly the vocabulary the UI needs. One poller, one endpoint, no new backend route.

**8.2 Loader + final-status UI**
- files: `src/app/invoice-pay/invoice-pay.component.html`, `src/app/invoice-pay/invoice-pay.component.scss`.
- Add a `paymentState !== 'idle'` block that reuses the existing design language of the pay modal (`:255-296`): a centred spinner + `invoice.paymentInProgress` while `awaiting`; a success panel with `invoice.paymentReceived`; a failure panel with `invoice.paymentStartError` + `paymentError`.
- Add an accessible live region: `role="status" aria-live="polite"` on the loader container, `role="alert"` on the failure panel.

**8.3 Mobile-money vs card choice**
- files: `invoice-pay.component.html` (inside the pay modal `:255-284`), `invoice-pay.component.ts`.
- Add a segmented control with two options; `mobileMoney` selected by default; `card` is `disabled` and labelled with a new i18n key `invoice.paymentMethodCardComingSoon`.
- The chosen value is only sent when it differs from the default, so the request body is byte-identical to today for existing clients (`paymentMethod` is optional in the DTO).

**8.4 i18n**
- files: `src/assets/i18n/fr.json` (`invoice.*`, ~`:1725-1800`), `src/assets/i18n/en.json`.
- Add: `invoice.paymentMethod` (fr: "Méthode de paiement"), `invoice.paymentMethodMobileMoney`, `invoice.paymentMethodCard`, `invoice.paymentMethodCardComingSoon`, `invoice.paymentAwaitingUssd`, `invoice.paymentFailed`.

- proof: `invoice-pay.component.spec.ts` (new; none exists today — follow `PaymentRequestCreateComponent`-style TestBed + `HttpTestingController` with `provideMockStore`/`TranslateModule.forRoot()` as the app already does): (a) a response without `redirect_url` does **not** emit `paymentStartError` and enters `awaiting`; (b) a response with `redirect_url` calls `window.open`; (c) a `failed` payin sets `paymentState='failed'` and stops the interval; (d) `ngOnDestroy` clears both timers.
- depends on: 5.2, 6.2

### Stage 9 — Frontend: payment-request wizard

**9.1 Fix the hangs**
- files: `src/app/feature-module/payment-request/payment-request-create/payment-request-create.component.ts`.
- `handleRequest(transactionId)` `:322-332`: **remove** the `if (!this.redirect_url) return;` early return. New behaviour: when `redirect_url` is present → the existing `openModal()` + close-watch; when absent → do nothing (the loader from `startPolling` is already showing).
- `startPolling(transactionId)` `:296-306`: **remove** the `if (!transactionId)` bail. Derive the id defensively: `res?.transactionId || res?.data?.transactionId || res?.id || res?.data?.id`, and if still empty, fall back to polling the transaction by the created payment request (`GET /payment-request/my`) — or, better, surface a distinct error instead of a silent hang. **Recommended**: keep the transaction poller keyed on the derived id, and if the id is genuinely absent, set `pollStatus='failed'` with an explicit message rather than leaving the spinner forever.
- `checkStatus(transactionId)` `:334-371`: unchanged vocabulary, but add `pollStatus='failed'` when the poller errors after N attempts (currently a failed HTTP call silently keeps `processing=true`).

**9.2 Network deduced from the prefix + real phone validation**
- files: the component + `payment-request-create.component.html`.
- `updatePhoneValidator()` `:188-192` currently sets `[Validators.required]` only, even though `FieldValidationService.operatorPhoneValidator` exists (`:186-201`). Wire it to the country code + derived operator, so the payer gets an inline error instead of a silent backend 400:
```ts
phoneControl?.setValidators([
  Validators.required,
  this.fieldValidationService.operatorPhoneValidator(() => this.countryCode, () => this.derivedOperator),
]);
```
- Add `derivedOperator`: mirror of the backend resolver for the **UI display only** (a small `{prefix → MTN|OM|…}` map in a frontend util, `src/app/services/field-validation/mobile-money-network.util.ts` (new)). The **backend remains the authority**; the frontend value is a hint/display and may be absent.
- Add an operator `<select>` that is **not** required: `Auto (détecté)` by default, with the country's operators as overrides sent as `mobile_money.network`. Since the brief mandates prefix-deduction, "Auto" is the default and the selector is an escape hatch.
- **Why not reuse `isValidOperatorPhone` as-is**: it only knows OM/MTN (237) and MPESA (254). Extend that service with a table-driven check delegating to the new util, keeping the existing OM/MTN regexes as the CM entries (no behaviour change for current CM users).

**9.3 Result screen becomes i18n-driven and outcome-aware**
- files: `payment-request-create.component.html:170-220`, `payment-request-create.component.ts`.
- Replace the hardcoded French strings with `| translate` keys under the existing `paymentRequest.status.*` namespace (`fr.json:1108-1113`) plus new keys `paymentRequest.status.awaitingUssd`, `paymentRequest.status.instructions`, and `paymentRequest.method.*`.
- Add the mobile-money / card chooser to the wizard form (same as 8.3): a `paymentMethod` control, `card` disabled, `mobile_money` default; the payload gains `paymentMethod` and `mobile_money.network` **only when chosen**.
- Keep `loader.gif` while `pollStatus === 'pending'` (this is already correct — the failure was that the state never advanced).

**9.4 Polling contract decision (payment-request)**
- Keep `GET /transaction/:id` (`paymentService.getTransactionData`, `:340`) and the `transaction_payin_*` vocabulary (`payment.service.ts:21-35`). Reasons: the creator is authenticated (JWT), the wizard already maps this vocabulary (`:341-368`), and it requires no new backend route. **Do not** switch this flow to the payin vocabulary — the two flows intentionally differ (public/guest vs authenticated/creator).

- proof: `payment-request-create.component.spec.ts` (new): (a) a response with no `redirect_url` still starts polling (no hang); (b) `pollStatus` reaches `success` on `transaction_payin_success` and `failed` on `transaction_payin_error`; (c) an invalid prefix blocks submit with an inline operator error and never calls the API; (d) the payload omits `network` when "Auto" is selected.
- depends on: 6.3

### Stage 10 — Verification, configuration, rollback rehearsal

**10.1 Run the full verification suite** — see `## Validation`.
**10.2 Configure the Flutterwave webhook** — see `## Webhook configuration`.
**10.3 Deploy runbook (order matters)**
1. Apply 2.1 (schema is additive; no migration required for new docs).
2. Run the one-shot repair: `db.payins.updateMany({ status: 'PENDING' }, { $set: { status: 'pending' } })` (only if such docs exist — count first).
3. Deploy with `DIRECT_CHARGE_ENABLED=false` → confirm all three flows behave exactly as before (flag-off regression pass).
4. Enable for one currency (`DIRECT_CHARGE_ENABLED=true`) with a test user, verify sandbox end-to-end.
5. Watch `PayinCron` logs for orphan `pending` payins for 24 h.
**10.4 Rollback rehearsal** — set `DIRECT_CHARGE_ENABLED=false`, restart, confirm the invoice and payment-request flows take the hosted branch. No code rollback needed.
- proof: a signed-off checklist in the PR description; the flag-off pass is mandatory.

---

## Security

| Surface | Control to preserve / add |
|---|---|
| Webhook (`POST /fw/webhook`, public) | Keep the `verif-hash` check; fix the multi-currency/empty-hash hole (7.1). Never log the hash, the header, or the raw body. Always 200 after signature validation so FW does not build a retry storm (which is itself a DoS vector). |
| Charge creation (`POST /fw/direct-charge`) | JWT-guarded; add the DTO so the global `ValidationPipe` applies (`amount` ≥ 100, `currency` allow-list, `email`, `phone`). Idempotency prevents charge amplification from replays. |
| Input handling | `phone` is stripped to digits by the resolver before reaching FW — no injection surface. `email` validated with `@IsEmail()`. `txRef` is server-generated. |
| Authorization boundary | `POST /invoices/:id/pay` stays public **by design** (guest payer) but is confined to an `InvoiceStatus.COMPLETED` invoice that is not already `payed` (`invoice.service.ts:423-428`). The direct path must not widen that: keep the same guards and only add the `mode` selector. |
| Secrets | No new secret in code or env. FW credentials stay encrypted in the `Gateway` collection and are decrypted per-currency by `GatewayLoaderService`. `client_ip` and `deviceFingerprint` are forwarded to FW but **never logged**. |
| PII | `deviceFingerprint` is an opaque client-generated UUID — no PII, no server-side derivation. `client_ip` is transient. Both must be excluded from audit-log metadata. |
| Rate limiting | Existing global `@nestjs/throttler` applies to the new endpoints (they stay on the same controller). Do not exempt them. |
| Response leakage | `attachChargeResult` stores the full FW envelope in `raw` for audit; the API response must expose only the whitelisted shape (8.3) — never the full `raw`. |

---

## Open questions (explicit — do not guess)

- **Q1 — XOF / multi-country gateway rows.** `Gateway.currency` is an enum of `['XAF','NGN','KES']` (`gateway.schema.ts:34`), so `GatewayLoaderService.getConfig('XOF')` throws `NotFoundException` and `FlutterwaveApiService.assertCredentials('XOF')` fails. The brief demands multi-currency XOF (SN/BF/CI/ML). **Decision needed**: (a) extend the `Gateway.currency` enum to include `XOF` (+ the other target currencies) and have an operator add an XOF gateway row with credentials, before XOF can work; or (b) ship V1 for XOF-less countries only. This plan assumes (a) is a follow-up task, and the resolver supports XOF from day one so no rewrite is needed when the gateway row appears. **Recommended: (a), as a separate small migration task.**
- **Q2 — exact FW network tokens.** The brief gives operator *names* per country (CM: MTN, Orange) while the existing code emits `String(method.code).toUpperCase()` (e.g. `MOMO`, `ORANGEMONEY`). The resolver table must encode FW's exact tokens (the franco charge has historically used `MTN` / `ORANGEMONEY`). **Verify each token against the sandbox before the table is frozen** — this is a one-line-per-row risk that a test cannot settle without FW. Flagged, not guessed.
- **Q3 — BF + ORANGEMONEY.** Confirmed mandatory `authorization_code` and V1 has no OTP step. The plan **fails fast** (`AUTHORIZATION_CODE_REQUIRED`) rather than charging and failing. **Confirm** product accepts "BF Orange is unavailable in V1" as user-visible behaviour.
- **Q4 — countries with no currency→gateway mapping** (GH, UG, RW, TZ, ZM). `getCountryForCurrency` (`:913`) only knows CM/CI/NG/KE/GH/UG/RW, and the schema enum only allows XAF/NGN/KES. **Confirm** which of these are actually in scope for V1 versus documented-but-inactive in the resolver table.
- **Q5 — idempotency key header.** Should `POST /fw/direct-charge` accept `Idempotency-Key` (as `/dev/direct-charge` does) or rely solely on the DB `txRef` uniqueness? The plan implements **both** (header honoured when present, `txRef` uniqueness always). **Confirm** the frontend will send the header (needed to make a double-click on "Payer" provably safe).

---

## Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | `FlutterwaveModule`/`PayinModule` hold **two `PayinService` instances**; only the FW-module copy has `secretHash` set | Webhook signature verification silently breaks if the charge/persistence code is moved to the other instance | Keep all new persistence calls on `FlutterwaveService.payinService` (FW-module). Move credential handling for the charge to `FlutterwaveApiService` (per-currency, no shared state). Add a spec asserting `createPayin` (hosted) is never called from the direct path. |
| R2 | `Payin.status` default is the invalid literal `'PENDING'` | Any doc created without an explicit status is invisible to `findPending` → the cron never polls it → transactions hang forever | Fix the default (2.1) **and** always pass `status: PayinStatus.PENDING` explicitly (4.1). Add the assertion to the spec. Run the one-shot repair (10.3). |
| R3 | Undeclared `error`/`meta` fields are silently dropped by strict mode | Failed charges lose their reason; `initPayin` loses `meta` | Declare both props (2.1). |
| R4 | `GatewayLoaderService` cache is **never invalidated** | A credential rotation or a newly added gateway (e.g. XOF) is not picked up until the process restarts → charge fails with a stale/absent key | Documented in the runbook: **restart the process** after changing gateway credentials. Do not introduce a new cache. |
| R5 | Removing the hosted `createPayin` from `createDirectCharge` changes `/dev/direct-charge`'s observable behaviour (it currently also creates a hosted session) | Integrators reading `raw.data.link` from a direct charge would break | No integrator can read `link` from a *direct* charge today in a supported way (the response returns `chargeResponse`, not a link). Still: this is a **breaking-by-correction** change — `dev.service.ts:347` reads `raw?.data?.link` from `createPayinTransaction`, a **different** method, so it is unaffected. Verify in the `dev` spec. |
| R6 | `forbidNonWhitelisted: true` on the global pipe vs the current `@Body() data: any` bypass on `POST /fw/direct-charge` | Adding a DTO could 400 existing clients that send extra fields | Use a **route-level** `new ValidationPipe({ whitelist:true, transform:true })` (strip, do not reject). Cover with a test that sends an unknown field and expects success. |
| R7 | Direct-charge failed webhooks now terminalise the transaction, whereas the hosted flow deliberately does not | A shared code path could regress the hosted retry behaviour | Gate strictly on `payin.raw.flow` (7.3). Explicit regression specs for both branches. |
| R8 | `DIRECT_CHARGE_FALLBACK_HOSTED` re-issuing a hosted session after a charge may have been created | **Double charge** | Fallback is allowed **only** for pre-charge validation errors (`UNSUPPORTED_COUNTRY`, `NETWORK_NOT_RESOLVED`, `AUTHORIZATION_CODE_REQUIRED`) and is structurally impossible after `chargeMobileMoney` is invoked. |
| R9 | Retry added to the transport layer | Duplicate FW charges | **No retries** in `FlutterwaveApiService.request()`. Documented in-code. Retry safety comes from `txRef` + `findReusablePending` + `IdempotencyService`. |
| R10 | Frontend `card` option shipped enabled by accident | Payer selects card, nothing happens | `disabled` + "coming soon" label in both UIs; backend returns 400 `PAYMENT_METHOD_NOT_SUPPORTED` for `paymentMethod:'card'`; covered by a DTO test. |
| R11 | Transaction transition table rejects a new path | Silent no-op (`updateTransactionStatus` returns the existing doc on an illegal transition `:909-914`), so the UI could hang | **No change to `TRANSACTION_STATUS_FROM` is needed** — every transition used (`PAYINPENDING→PAYINSUCCESS`, `PAYINPENDING→PAYINERROR`, `PAYINPENDING→PAYINCLOSED`) is already legal. Add a spec that asserts these three are allowed and that `PAYINSUCCESS→*` is refused. |
| R12 | Existing failing suites mask a new regression | A real failure is mistaken for a known one | Record the baseline (0.2) and require the **same 3** failures, no more. |
| R13 | `payin/get-txRef/:txRef` is unauthenticated and now polled more aggressively by the direct path | Enumeration of `txRef` values / load | `txRef` is a 4-byte-random + timestamp token (`generateTxRef` `:101`), not guessable; the payload is non-sensitive status data. Keep the existing 5 s cadence; rely on `@nestjs/throttler`. If this is unacceptable, add a signed `txRef` — **flagged, not silently changed**. |

**Rollback**: single lever — `DIRECT_CHARGE_ENABLED=false` (0.1). All three entrypoints revert to the hosted behaviour with no code change and no DB migration to undo (the added schema props are inert; the added i18n keys are unused).

---

## Validation

All commands are the project's own (`package.json` scripts, verified):

**Backend** (`/Users/flambel/Documents/GitHub/digikuntz-transfert_backend`)
```bash
npm run build          # nest build  (must pass, 0 TS errors)
npm run lint           # eslint "{src,apps,libs,test}/**/*.ts" --fix
npm test               # jest  (rootDir: src, testRegex .*\.spec\.ts$)
npm run test:cov       # jest --coverage
npx jest src/flutterwave --silent   # focused run while iterating
```
Baseline to preserve: **26 passed / 27**, with exactly 3 pre-existing failing suites (`plans/plans.service.spec.ts`, `plans/plans.controller.spec.ts`, `common/upload-dir.util.spec.ts`). A 4th failure is a regression.

`npm run test:e2e` exists (`jest --config ./test/jest-e2e.json`) but the e2e suite is not part of the baseline and must not be relied on as a gate.

**Frontend** (`/Users/flambel/Documents/GitHub/paymentGateway`)
```bash
npm run build          # ng build
npm run lint           # ng lint
npm test               # ng test  — Karma/Jasmine; needs a headless browser and is likely unusable in this environment
```
> **Cannot determine**: whether `ng test` can run in this environment (Karma requires a browser). If it cannot, the frontend proof of 8.1/9.1 is the new specs **plus** a manual sandbox pass; state this explicitly in the PR rather than claiming a green test run.

**Manual sandbox verification (mandatory — unit tests cannot settle these)**
1. XAF + a real CM MTN sandbox number → USSD push received, `Payin.status='pending'`, exactly one `/v3/charges?type=mobile_money_franco` in the FW dashboard, **zero** `/v3/payments`.
2. Approve in the FW sandbox → webhook arrives → `Payin='successful'`, `Transaction='transaction_payin_success'`, invoice `payed=true`.
3. Replay the identical webhook → no second credit, no second `statusChanges` entry.
4. Reject/abandon in the sandbox → `Payin='failed'`, the transaction moves to `PAYINERROR` via the webhook (direct flow) or, if the webhook is not delivered, via the cron within `DIRECT_CHARGE_CLOSE_MINUTES`; the frontend stops its loader and shows the failure state.
5. A sandbox charge that returns `meta.authorization.mode === 'redirecturl'` → the backend surfaces `redirect_url`, the frontend opens it (outcome b) and keeps polling.
6. `mode:'hosted'` on the same invoice → identical to today (regression).
7. `DIRECT_CHARGE_ENABLED=false` → all three entrypoints take the hosted branch.

---

## Webhook configuration (exact URL)

Derived from the code, not guessed:

- `main.ts` declares **no** `setGlobalPrefix` → the route path is exactly the decorator path.
- `@Controller('fw')` (`flutterwave.controller.ts:41`) + `@Post('webhook')` (`:464`) → `/fw/webhook`.
- `BACK_URL` is the public base of this backend (`.env`: `BACK_URL=http://localhost:3002`; the production value is present but commented: `# BACK_URL=https://app.digikuntz.com`), and Swagger's production server is declared as `https://app.digikuntz.com` (`main.ts:313`).

**Configure in the Flutterwave dashboard → Settings → Webhooks:**

```
Production:  https://app.digikuntz.com/fw/webhook
Local dev:   https://<your-subdomain>.ngrok-free.app/fw/webhook   (same pattern as the existing MPESA_STK_CALLBACK_URL in .env)
```

- Method: `POST`. Secret hash: the **exact** value of `FLUTTERWAVE_SECRET_HASH` stored (encrypted) in the `Gateway` collection credentials for that currency — `verifyWebhook` compares the `verif-hash` header to it by **plain string equality**.
- **Must be set for every active Flutterwave gateway row** (per-currency), otherwise the multi-currency fix in 7.1 is what keeps webhooks working.
- Until 7.1 ships, a webhook arriving before the first charge of the process lifetime is rejected with 401 because `secretHash` is still `''`.

---

## Test plan

### 9.1 `src/flutterwave/mobile-money-network.util.spec.ts` (new)
- Resolves CM + `2376XXXXXXXX`: MTN numbers → `MTN`, Orange numbers → `ORANGEMONEY`, `chargeType='mobile_money_franco'`, `country='CM'`, `currency='XAF'`.
- **Boundary prefixes**: the longest-prefix-match rule wins for every adjacent/overlapping allocation (e.g. a `655…` number must not fall into the MTN bucket, and vice versa). One case per boundary in the table.
- Dial-code inference with no leading `+`: `237…` → CM, `225…` → CI, `226…` → BF, `221…` → SN.
- Local format + currency hint: `6XXXXXXXX` + `currency:'XAF'` → CM.
- Unknown prefix → `NETWORK_NOT_RESOLVED`; unknown country → `UNSUPPORTED_COUNTRY`.
- `network:'MTN'` override on an Orange-numbered prefix → accepted (explicit override wins) and the resolved `msisdn` is still country-prefixed.
- BF + ORANGEMONEY → `AUTHORIZATION_CODE_REQUIRED` (V1 limitation, documented).
- **Regression guard**: no KES rule exists in the table (`resolveMobileMoneyNetwork({phone, currency:'KES'})` throws), proving `normalizeKesMsisdnStrict` remains the sole KES authority.

### 9.2 `src/flutterwave/mobile-money-charge.builder.spec.ts` (new)
- `amount: 100.4` → body `amount === 100`; `amount: 99` → 400 `AMOUNT_BELOW_MIN`; `amount: 99.9` → `100` (rounds up to the minimum).
- Unsupported currency → 400 `UNSUPPORTED_CURRENCY`.
- `country`/`network`/`chargeType` come from the resolver, **never** from the currency (assert with an XAF/SN number → `country:'SN'`, not `'CM'`).
- `client_ip` present only when `clientIp` is given; `device_fingerprint` present only when given.
- `meta.flow` reflects the `flow` input; `authorization_code` is **never** present.
- `chargeType` is `mobile_money_franco` for XAF/XOF and the correct one for GHS/NGN/KES/UGX/RWF.

### 9.3 `src/payin/payin.service.spec.ts` (new)
- `createPendingPayin` passes `status:'pending'` explicitly to `payinModel.create`; a 11000 error returns the existing doc; `amount/currency/customerEmail` are persisted.
- `attachChargeResult` persists `flwTxId` + `raw` + `status`; it does not downgrade a terminal status.
- `findReusablePending` returns the doc only for `pending` **with** `flwTxId`; `null` for terminal and for pending-without-flwTxId.
- `verifyWebhook`: `successful`/`failed`/`cancelled` map to the right enum; a replayed payload performs no second write; unknown `txRef` returns `{status:'ok'}` and throws nothing; a bad signature throws `UnauthorizedException`; a signature matching a candidate hash (multi-gateway) passes.
- `findPendingDirectCharges` filters on `{'raw.flow': ...}`.

### 9.4 `src/flutterwave/flutterwave.service.direct-charge.spec.ts` (new)
- **Ordering**: `createTransaction` → `createPendingPayin` → `chargeMobileMoney` → `attachChargeResult`, asserted via a shared `jest.fn()` call-order array.
- `payinService.createPayin` (hosted `/v3/payments`) is **never** called.
- `getCountryForCurrency` is never called on the direct path (spy, asserting BUG 3's currency-map behaviour is gone).
- `findReusablePending` returning a doc → **zero** `chargeMobileMoney` calls, and the original response is returned.
- A `chargeMobileMoney` rejection → payin marked `FAILED` and the mapped `HttpException` is rethrown; the transaction stays `PAYINPENDING`.
- The response contains `txRef`, `transactionId`, `mode`, and `redirect_url` **only** when FW returned `meta.authorization.redirect_url`.

### 9.5 `src/flutterwave/flutterwave.service.webhook.spec.ts` (new)
- Direct-charge `failed` webhook → `Transaction='transaction_payin_error'`.
- Hosted `failed` webhook → transaction stays `transaction_payin_pending` (regression guard for R7).
- Direct-charge `successful` webhook → `processSuccessfulPayin` invoked; a replay does not double-invoke.
- **Transition-table guard**: `PAYINPENDING→PAYINSUCCESS`, `→PAYINERROR`, `→PAYINCLOSED` are legal; `PAYINSUCCESS→PAYINPENDING` is a no-op (proves 7.4 needs no table change).

### 9.6 `src/flutterwave/flutterwave-api.service.spec.ts` (extend, existing style)
- `chargeMobileMoney` → `POST ${BASE}/charges?type=mobile_money_franco`, header `Bearer <currency secret>`, `timeout === 30000`, upstream 401 → 502, no-credentials short-circuit, and the **full envelope** (including `meta.authorization`) is returned.
- Mocking style to copy verbatim: `http = { request: jest.fn() }`, `of({ data: envelope })`, `throwError(() => axiosError(401, {...}))`, `gatewayLoader.getConfig.mockResolvedValue(gatewayConfig({...}))`.

### 9.7 `src/invoice/invoice.service.spec.ts` (new)
- `DIRECT_CHARGE_ENABLED=false` → the hosted branch is taken and `redirect_url` is returned (flag-off regression).
- `mode:'direct'` → `payinResult.redirect_url === null`, `mode === 'direct'`, invoice `status='paying'`, `transactionId` saved.
- The PAYING-reuse branch (`:432-453`) returns `mode:'direct'` + `redirect_url:null` for a direct transaction and the original link for a hosted one.

### 9.8 `src/dev/dev.service.spec.ts` (new/extend)
- `createDirectPayinTransaction` no longer calls `payinService.createPayin`; it still returns the `payin_pending` status map; the idempotency wrapper short-circuits a replayed key.

### 9.9 Frontend specs (new)
- `invoice-pay.component.spec.ts` — cases (a)-(d) from 8.4.
- `payment-request-create.component.spec.ts` — cases (a)-(d) from 9.4.

> **Not testable in-repo (manual only)**: whether FW actually accepts each `network` token and each prefix mapping (Q2), whether a real USSD push is received, and whether `meta.authorization.mode === 'redirecturl'` occurs for a given number. These are sandbox checklist items.

---

## Appendix — one-line summary of the three bugs being fixed

| Bug | Location | Fix |
|---|---|---|
| 1 — stale/empty credentials → 401→502 | `directMobileMoneyCharge` uses `this.authHeader()` with shared `fwSecret`; `createDirectCharge` never calls `loadDbCredentials` | Route the charge through `FlutterwaveApiService.chargeMobileMoney` (per-currency credentials, 30 s timeout, no retry) — Stage 3 |
| 2 — a "direct" charge also created a hosted checkout session and dropped `flwTxId`/`raw` | `createDirectCharge:1107-1117` called `payinService.createPayin` (POST `/v3/payments`) | Delete that call; persist-then-charge with `createPendingPayin` + `attachChargeResult` — Stages 4-5 |
| 3 — payload lacks `client_ip`/`device_fingerprint`; `country` only for XAF/XOF; no MSISDN normalisation; `network` not validated | `directMobileMoneyCharge:1003-1020`, `getCountryForCurrency:913`, controller `:243` emitting `MOMO`/`ORANGEMONEY` | `buildMobileMoneyCharge` derived entirely from `resolveMobileMoneyNetwork`, plus `req.ip` and the client `deviceFingerprint` — Stages 1, 6.1 |
