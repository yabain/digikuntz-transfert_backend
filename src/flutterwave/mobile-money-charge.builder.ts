import { HttpException, HttpStatus } from '@nestjs/common';
import {
  ChargeType,
  DIRECT_CHARGE_CURRENCIES,
  MobileMoneyNetworkError,
  ResolvedNetwork,
  isDirectChargeCurrency,
  resolveMobileMoneyNetwork,
} from './mobile-money-network.util';

/**
 * Flutterwave rejects a francophone mobile-money charge below 100
 * (`amount` is documented as "should not be less than 100").
 */
export const MIN_DIRECT_CHARGE_AMOUNT = 100;

/**
 * Upper bound on a single direct charge.
 *
 * `POST /fw/direct-charge` keeps an untyped body (`data: any`) for backward
 * compatibility with existing callers, so the global `ValidationPipe` cannot
 * bound `estimation`. This server-side ceiling is therefore the only thing that
 * stops an absurd amount (or a typo) from reaching Flutterwave and being stored.
 * Set far above any legitimate single mobile-money transaction.
 */
export const MAX_DIRECT_CHARGE_AMOUNT = 1_000_000_000;

/** Ceiling on the customer email forwarded to Flutterwave (RFC max is 254). */
export const MAX_EMAIL_LENGTH = 254;

/** Which product surface initiated the charge; persisted for reconciliation. */
export type DirectChargeFlow =
  | 'direct_charge'
  | 'payment_request'
  | 'invoice'
  | 'transfer';

export interface BuildChargeInput {
  txRef: string;
  amount: number;
  currency: string;
  phone: string;
  email: string;
  fullname?: string;
  /** Explicit overrides; normally left undefined so the phone wins. */
  country?: string;
  network?: string;
  /** Forwarded to Flutterwave for fraud scoring; never logged. */
  clientIp?: string;
  deviceFingerprint?: string;
  flow: DirectChargeFlow;
  meta?: Record<string, unknown>;
}

export interface BuiltCharge {
  chargeType: ChargeType;
  /** Exact JSON body for `POST /v3/charges?type={chargeType}`. */
  body: Record<string, any>;
  resolved: ResolvedNetwork;
}

/**
 * Error codes thrown BEFORE any request reaches Flutterwave.
 *
 * Only these may be silently downgraded to the hosted checkout: for anything
 * else a charge may already exist upstream, so the error must surface instead of
 * being masked by a second payment route.
 */
export const PRE_CHARGE_REJECTION_CODES = [
  'MISSING_TX_REF',
  'UNSUPPORTED_CURRENCY',
  'INVALID_AMOUNT',
  'AMOUNT_BELOW_MIN',
  'AMOUNT_ABOVE_MAX',
  'MISSING_EMAIL',
  'INVALID_EMAIL',
  'INVALID_PHONE',
  'UNSUPPORTED_COUNTRY',
  'AMBIGUOUS_NUMBER',
  'NETWORK_NOT_RESOLVED',
  'AUTHORIZATION_CODE_REQUIRED',
  // The feature flag is off: nothing was sent upstream, so the caller may safely
  // use the hosted checkout — this is what makes `DIRECT_CHARGE_ENABLED=false` a
  // real rollback lever.
  'DIRECT_CHARGE_DISABLED',
] as const;

/**
 * True when the failure happened before any Flutterwave request was issued.
 *
 * @param {unknown} error - Anything thrown by `buildMobileMoneyCharge`.
 * @returns {boolean} - Whether the caller may safely fall back to another route.
 */
export function isPreChargeRejection(error: unknown): boolean {
  if (!(error instanceof HttpException)) return false;

  const response = error.getResponse();
  const code =
    response && typeof response === 'object'
      ? (response as Record<string, unknown>).code
      : undefined;

  return (
    typeof code === 'string' &&
    (PRE_CHARGE_REJECTION_CODES as readonly string[]).includes(code)
  );
}

/**
 * Charge outcomes a caller may act on immediately.
 *
 * These are the `PayinStatus` values a charge envelope may carry. Anything else
 * (unknown, absent, malformed) must NOT be acted on: the webhook and the cron are
 * the authority on the final state.
 */
export type ChargeOutcome = 'successful' | 'failed' | 'cancelled' | 'pending';

/**
 * Narrows an untrusted `chargeStatus` to a known outcome.
 *
 * The charge envelope is untyped, so the value arrives as `unknown`. Strict
 * equality keeps this cast-free and coercion-free, and returns `''` for anything
 * unrecognised.
 *
 * @param {unknown} value - Raw `chargeStatus` from a charge result.
 * @returns {ChargeOutcome|''} - The narrowed outcome, or `''` when unrecognised.
 */
export function readChargeOutcome(value: unknown): ChargeOutcome | '' {
  return value === 'successful' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'pending'
    ? value
    : '';
}

/**
 * Normalises a client IP for Flutterwave: unwraps the IPv4-mapped IPv6 form
 * (`::ffff:1.2.3.4`) and drops anything that is not a plausible address, because
 * an invalid `client_ip` makes Flutterwave reject the whole charge.
 *
 * @param {unknown} value - Raw candidate IP.
 * @returns {string|undefined} - A normalised IP, or undefined when unusable.
 */
function normalizeClientIp(value: unknown): string | undefined {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return undefined;

  const unwrapped = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  return /^[0-9a-fA-F.:]{3,45}$/.test(unwrapped) ? unwrapped : undefined;
}

function badRequest(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  return new HttpException(
    { message, code, ...(details ? { details } : {}) },
    HttpStatus.BAD_REQUEST,
  );
}

/**
 * Builds the exact Flutterwave direct mobile-money charge request.
 *
 * Everything country/network related comes from `resolveMobileMoneyNetwork`
 * (the phone number is the authority) — never from a currency→country map, which
 * is what used to make an Ivorian number be charged as Cameroonian.
 *
 * `authorization_code` is intentionally never sent: the OTP second step is a
 * documented V1 limitation, and a pair that requires it is refused upstream by
 * the resolver instead of being charged and then failing.
 *
 * @throws {HttpException} 400 with a machine-readable `code` and `details`.
 */
export function buildMobileMoneyCharge(input: BuildChargeInput): BuiltCharge {
  const txRef = String(input.txRef ?? '').trim();
  if (!txRef) {
    throw badRequest('MISSING_TX_REF', 'tx_ref is required to charge.');
  }

  const currency = String(input.currency ?? '')
    .trim()
    .toUpperCase();
  if (!isDirectChargeCurrency(currency)) {
    throw badRequest(
      'UNSUPPORTED_CURRENCY',
      `Currency '${currency || '(empty)'}' is not supported for direct mobile money charge.`,
      { currency, supported: [...DIRECT_CHARGE_CURRENCIES] },
    );
  }

  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw badRequest('INVALID_AMOUNT', 'Amount must be a positive number.', {
      amount: input.amount,
    });
  }
  if (amount < MIN_DIRECT_CHARGE_AMOUNT) {
    throw badRequest(
      'AMOUNT_BELOW_MIN',
      `Amount must be at least ${MIN_DIRECT_CHARGE_AMOUNT}.`,
      { amount, minimum: MIN_DIRECT_CHARGE_AMOUNT },
    );
  }
  if (amount > MAX_DIRECT_CHARGE_AMOUNT) {
    throw badRequest(
      'AMOUNT_ABOVE_MAX',
      `Amount must not exceed ${MAX_DIRECT_CHARGE_AMOUNT}.`,
      { amount, maximum: MAX_DIRECT_CHARGE_AMOUNT },
    );
  }

  const email = String(input.email ?? '').trim();
  if (!email) {
    throw badRequest(
      'MISSING_EMAIL',
      'A customer email is required for a Flutterwave charge.',
    );
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    // Length only: Flutterwave owns format validation, but an unbounded value
    // must not be forwarded upstream nor persisted on the payin.
    throw badRequest('INVALID_EMAIL', 'Customer email is too long.');
  }
  let resolved: ResolvedNetwork;
  try {
    resolved = resolveMobileMoneyNetwork({
      phone: input.phone,
      currency,
      country: input.country,
      network: input.network,
    });
  } catch (error) {
    if (error instanceof MobileMoneyNetworkError) {
      throw badRequest(error.code, error.message, error.details);
    }
    throw error;
  }

  const body: Record<string, any> = {
    tx_ref: txRef,
    amount,
    currency: resolved.currency,
    phone_number: resolved.msisdn,
    email,
    fullname: String(input.fullname ?? '').trim() || 'Customer',
    country: resolved.country,
    network: resolved.network,
    meta: {
      app: 'digikuntz-payments',
      flow: input.flow,
      // Lets the webhook / reconciliation tell V1 charges apart once the OTP
      // second step exists.
      authorizationCodeApplied: false,
      ...(input.meta ?? {}),
    },
  };

  // Optional fraud-scoring fields: omitted entirely when unknown, which
  // Flutterwave accepts.
  const clientIp = normalizeClientIp(input.clientIp);
  if (clientIp) body.client_ip = clientIp;

  const deviceFingerprint = String(input.deviceFingerprint ?? '').trim();
  if (deviceFingerprint) body.device_fingerprint = deviceFingerprint;

  return { chargeType: resolved.chargeType, body, resolved };
}
