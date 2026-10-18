/**
 * Phone-prefix → mobile-money network resolution.
 *
 * Flutterwave requires an explicit `country` + `network` pair for a direct
 * mobile-money charge (`POST /v3/charges?type=...`). The controller used to send
 * the raw `PaymentMethod.code` (e.g. `MOMO`, `ORANGEMONEY`), which is not part of
 * Flutterwave's vocabulary, so charges failed. This module is the single source
 * of truth for the mapping and derives it from the payer's phone number.
 *
 * Design constraints:
 * - PURE: no DI, no I/O, no side effects — trivially unit-testable.
 * - KES / M-Pesa is deliberately ABSENT. That rail has its own strict MSISDN
 *   authority (`PayinService.normalizeKesMsisdnStrict`) and its own gateway; the
 *   caller must short-circuit KES *before* reaching this resolver.
 */

/** Flutterwave charge types this resolver can produce. */
export type ChargeType =
  | 'mobile_money_franco'
  | 'mobile_money_nigeria'
  | 'mobile_money_ghana'
  | 'mobile_money_uganda'
  | 'mobile_money_rwanda';

/**
 * Currencies the direct path supports.
 *
 * Only currencies with a *verified* Flutterwave charge type are listed. TZS and
 * ZMW are intentionally excluded until their charge type is confirmed against
 * Flutterwave (guessing one would silently misroute a payment).
 */
export const DIRECT_CHARGE_CURRENCIES = [
  'XAF',
  'XOF',
  'NGN',
  'GHS',
  'UGX',
  'RWF',
] as const;

export type DirectChargeCurrency = (typeof DIRECT_CHARGE_CURRENCIES)[number];

/**
 * Charge types the HTTP transport is allowed to issue.
 *
 * `mpesa` is included even though this resolver never produces it: the legacy
 * Kenya path (`directMobileMoneyCharge` with `currency: 'KES'`) is preserved
 * verbatim so the M-Pesa rail cannot regress.
 */
export type FlutterwaveChargeType = ChargeType | 'mpesa';

const DIRECT_CHARGE_CURRENCY_SET = new Set<string>(DIRECT_CHARGE_CURRENCIES);

export function isDirectChargeCurrency(
  currency: unknown,
): currency is DirectChargeCurrency {
  return (
    typeof currency === 'string' &&
    DIRECT_CHARGE_CURRENCY_SET.has(currency.trim().toUpperCase())
  );
}

export interface MobileMoneyNetworkRule {
  /** ISO2 country code, e.g. `CM`. */
  country: string;
  currency: DirectChargeCurrency;
  /** International dial code, digits only, e.g. `237`. */
  dialCode: string;
  /**
   * National significant prefixes (WITHOUT the dial code) allocated to this
   * operator. An empty list means "cannot be deduced yet" — the caller must
   * provide an explicit `network`, otherwise resolution fails with
   * `NETWORK_NOT_RESOLVED` and lists the available networks.
   */
  prefixes: string[];
  /** Inclusive `[min, max]` length of the national significant number. */
  nationalLength: [number, number];
  /** Flutterwave network token, e.g. `MTN`, `ORANGEMONEY`. */
  network: string;
  chargeType: ChargeType;
  /** Flutterwave mandates an OTP (`authorization_code`) for this pair. */
  requiresAuthorizationCode?: boolean;
}

/** Expands `from`..`to` inclusive into zero-padded prefixes (readable table). */
function range(from: number, to: number, width = 3): string[] {
  const out: string[] = [];
  for (let n = from; n <= to; n += 1) out.push(String(n).padStart(width, '0'));
  return out;
}

/**
 * Cameroon allocations, taken verbatim from this repository's own validators
 * (`FieldValidationService.isValidOperatorPhone`): MTN `6(50-54|7x|80-85)`,
 * Orange `6(55-59|86-89|9x)`.
 */
const CM_MTN_PREFIXES = [
  ...range(650, 654),
  ...range(670, 679),
  ...range(680, 685),
];
const CM_ORANGE_PREFIXES = [
  ...range(655, 659),
  ...range(686, 689),
  ...range(690, 699),
];

/**
 * The mapping table.
 *
 * NOTE ON PREFIX COVERAGE: only Cameroon is fully populated, because that is the
 * only country whose operator allocations are already encoded and audited inside
 * this repository. Rows with `prefixes: []` are *structurally* supported — the
 * country, currency, charge type and accepted networks are known — but prefix
 * deduction must be filled in from an authoritative allocation source and then
 * confirmed against the Flutterwave sandbox before being enabled. Until then the
 * caller selects the operator explicitly and everything works the same.
 */
export const MOBILE_MONEY_NETWORKS: MobileMoneyNetworkRule[] = [
  // ---------------------------------------------------------------- Cameroon
  {
    country: 'CM',
    currency: 'XAF',
    dialCode: '237',
    prefixes: CM_MTN_PREFIXES,
    nationalLength: [9, 9],
    network: 'MTN',
    chargeType: 'mobile_money_franco',
  },
  {
    country: 'CM',
    currency: 'XAF',
    dialCode: '237',
    prefixes: CM_ORANGE_PREFIXES,
    nationalLength: [9, 9],
    network: 'ORANGEMONEY',
    chargeType: 'mobile_money_franco',
  },

  // ----------------------------------------------------------------- Senegal
  {
    country: 'SN',
    currency: 'XOF',
    dialCode: '221',
    prefixes: [],
    nationalLength: [9, 9],
    network: 'ORANGEMONEY',
    chargeType: 'mobile_money_franco',
  },
  {
    country: 'SN',
    currency: 'XOF',
    dialCode: '221',
    prefixes: [],
    nationalLength: [9, 9],
    network: 'FREE',
    chargeType: 'mobile_money_franco',
  },
  {
    country: 'SN',
    currency: 'XOF',
    dialCode: '221',
    prefixes: [],
    nationalLength: [9, 9],
    network: 'WAVE',
    chargeType: 'mobile_money_franco',
  },

  // ------------------------------------------------------------ Burkina Faso
  {
    country: 'BF',
    currency: 'XOF',
    dialCode: '226',
    prefixes: [],
    nationalLength: [8, 8],
    network: 'ORANGEMONEY',
    chargeType: 'mobile_money_franco',
    // Flutterwave documents `authorization_code` as MANDATORY for BF+ORANGEMONEY.
    // V1 has no OTP step, so this pair fails fast instead of charging then failing.
    requiresAuthorizationCode: true,
  },
  {
    country: 'BF',
    currency: 'XOF',
    dialCode: '226',
    prefixes: [],
    nationalLength: [8, 8],
    network: 'MOOV',
    chargeType: 'mobile_money_franco',
  },

  // ------------------------------------------------------------ Côte d'Ivoire
  {
    country: 'CI',
    currency: 'XOF',
    dialCode: '225',
    prefixes: [],
    nationalLength: [8, 10],
    network: 'MTN',
    chargeType: 'mobile_money_franco',
  },
  {
    country: 'CI',
    currency: 'XOF',
    dialCode: '225',
    prefixes: [],
    nationalLength: [8, 10],
    network: 'ORANGEMONEY',
    chargeType: 'mobile_money_franco',
  },
  {
    country: 'CI',
    currency: 'XOF',
    dialCode: '225',
    prefixes: [],
    nationalLength: [8, 10],
    network: 'WAVE',
    chargeType: 'mobile_money_franco',
  },

  // -------------------------------------------------------------------- Mali
  {
    country: 'ML',
    currency: 'XOF',
    dialCode: '223',
    prefixes: [],
    nationalLength: [8, 8],
    network: 'ORANGEMONEY',
    chargeType: 'mobile_money_franco',
  },

  // ------------------------------------------------------------------- Ghana
  {
    country: 'GH',
    currency: 'GHS',
    dialCode: '233',
    prefixes: [],
    nationalLength: [9, 10],
    network: 'MTN',
    chargeType: 'mobile_money_ghana',
  },
  {
    country: 'GH',
    currency: 'GHS',
    dialCode: '233',
    prefixes: [],
    nationalLength: [9, 10],
    network: 'VODAFONE',
    chargeType: 'mobile_money_ghana',
  },
  {
    country: 'GH',
    currency: 'GHS',
    dialCode: '233',
    prefixes: [],
    nationalLength: [9, 10],
    network: 'AIRTELTIGO',
    chargeType: 'mobile_money_ghana',
  },

  // ----------------------------------------------------------------- Nigeria
  {
    country: 'NG',
    currency: 'NGN',
    dialCode: '234',
    prefixes: [],
    nationalLength: [10, 10],
    network: 'MTN',
    chargeType: 'mobile_money_nigeria',
  },
  {
    country: 'NG',
    currency: 'NGN',
    dialCode: '234',
    prefixes: [],
    nationalLength: [10, 10],
    network: 'AIRTEL',
    chargeType: 'mobile_money_nigeria',
  },
  {
    country: 'NG',
    currency: 'NGN',
    dialCode: '234',
    prefixes: [],
    nationalLength: [10, 10],
    network: 'GLO',
    chargeType: 'mobile_money_nigeria',
  },
  {
    country: 'NG',
    currency: 'NGN',
    dialCode: '234',
    prefixes: [],
    nationalLength: [10, 10],
    network: '9MOBILE',
    chargeType: 'mobile_money_nigeria',
  },

  // ------------------------------------------------------------------- Uganda
  {
    country: 'UG',
    currency: 'UGX',
    dialCode: '256',
    prefixes: [],
    nationalLength: [9, 9],
    network: 'MTN',
    chargeType: 'mobile_money_uganda',
  },
  {
    country: 'UG',
    currency: 'UGX',
    dialCode: '256',
    prefixes: [],
    nationalLength: [9, 9],
    network: 'AIRTEL',
    chargeType: 'mobile_money_uganda',
  },

  // ------------------------------------------------------------------- Rwanda
  {
    country: 'RW',
    currency: 'RWF',
    dialCode: '250',
    prefixes: [],
    nationalLength: [9, 9],
    network: 'MTN',
    chargeType: 'mobile_money_rwanda',
  },
  {
    country: 'RW',
    currency: 'RWF',
    dialCode: '250',
    prefixes: [],
    nationalLength: [9, 9],
    network: 'AIRTEL',
    chargeType: 'mobile_money_rwanda',
  },
];

/** Common spelling variants accepted for an explicit `network` override. */
const NETWORK_ALIASES: Record<string, string> = {
  ORANGE: 'ORANGEMONEY',
  // Short codes produced by the frontend's `mapProviderToBackend()`.
  OM: 'ORANGEMONEY',
  MOMO: 'MTN',
  ATL: 'AIRTELTIGO',
  MPESA: 'MPESA',
  // Operator product names.
  MOBILEMONEY: 'MTN',
  MOOVMONEY: 'MOOV',
  AIRTELMONEY: 'AIRTEL',
  VODACOM: 'VODAFONE',
  TELECEL: 'VODAFONE',
};

export function normalizeNetworkToken(value: unknown): string {
  // Explicit narrowing keeps the stringification of an unexpected object from
  // producing '[object Object]' (which could otherwise never match a rule).
  const raw =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const token = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return NETWORK_ALIASES[token] ?? token;
}

/** Distinct dial codes, longest first so `237` wins over any shorter overlap. */
const DIAL_CODES: string[] = [
  ...new Set(MOBILE_MONEY_NETWORKS.map((rule) => rule.dialCode)),
].sort((a, b) => b.length - a.length);

const COUNTRY_BY_DIAL_CODE = new Map<string, string>(
  MOBILE_MONEY_NETWORKS.map((rule) => [rule.dialCode, rule.country]),
);

export type MobileMoneyNetworkErrorCode =
  | 'INVALID_PHONE'
  | 'UNSUPPORTED_CURRENCY'
  | 'UNSUPPORTED_COUNTRY'
  | 'AMBIGUOUS_NUMBER'
  | 'NETWORK_NOT_RESOLVED'
  | 'AUTHORIZATION_CODE_REQUIRED';

export class MobileMoneyNetworkError extends Error {
  constructor(
    readonly code: MobileMoneyNetworkErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'MobileMoneyNetworkError';
  }
}

export interface ResolveNetworkInput {
  phone: string;
  /** Hint used when the number carries no dial code (e.g. `XAF`). */
  currency?: string;
  /** ISO2 hint used when the number carries no dial code (e.g. `CM`). */
  country?: string;
  /** Explicit operator override; wins only when prefix deduction fails. */
  network?: string;
}

export interface ResolvedNetwork {
  country: string;
  currency: DirectChargeCurrency;
  network: string;
  chargeType: ChargeType;
  /** Country-prefixed, digits-only MSISDN ready for Flutterwave. */
  msisdn: string;
  requiresAuthorizationCode: boolean;
}

function rulesForCountry(country: string): MobileMoneyNetworkRule[] {
  return MOBILE_MONEY_NETWORKS.filter((rule) => rule.country === country);
}

function uniqueCountriesForCurrency(
  currency: DirectChargeCurrency | undefined,
): string[] {
  return [
    ...new Set(
      MOBILE_MONEY_NETWORKS.filter(
        (rule) => !currency || rule.currency === currency,
      ).map((rule) => rule.country),
    ),
  ];
}

/**
 * Resolves the Flutterwave `country` + `network` for a payer phone number.
 *
 * Resolution order:
 * 1. longest matching dial code in the number (authoritative);
 * 2. otherwise the `country` hint, or a `currency` hint that maps to exactly one
 *    supported country;
 * 3. national-length validation for that country;
 * 4. longest-prefix operator match, then the explicit `network` override;
 * 5. OTP guard for pairs Flutterwave requires an `authorization_code` for.
 *
 * @throws {MobileMoneyNetworkError} with a machine-readable `code` and `details`.
 */
export function resolveMobileMoneyNetwork(
  input: ResolveNetworkInput,
): ResolvedNetwork {
  const digits = String(input.phone ?? '').replace(/\D/g, '');
  if (digits.length < 6) {
    throw new MobileMoneyNetworkError(
      'INVALID_PHONE',
      'A valid phone number is required to determine the mobile money network.',
      { received: digits.length },
    );
  }

  const currencyHintRaw = String(input.currency ?? '')
    .trim()
    .toUpperCase();
  const currencyHint = currencyHintRaw
    ? (currencyHintRaw as DirectChargeCurrency)
    : undefined;

  if (currencyHintRaw && !isDirectChargeCurrency(currencyHintRaw)) {
    throw new MobileMoneyNetworkError(
      'UNSUPPORTED_CURRENCY',
      `Currency '${currencyHintRaw}' is not supported for direct mobile money charge.`,
      { currency: currencyHintRaw, supported: [...DIRECT_CHARGE_CURRENCIES] },
    );
  }

  const countryHint = String(input.country ?? '')
    .trim()
    .toUpperCase();

  // 1. Dial code present in the number → authoritative for the country.
  const matchedDialCode = DIAL_CODES.find((code) => digits.startsWith(code));

  let country: string;
  let national: string;

  if (matchedDialCode) {
    country = COUNTRY_BY_DIAL_CODE.get(matchedDialCode) as string;
    national = digits.slice(matchedDialCode.length);
  } else {
    // 2. No dial code → fall back to hints.
    const candidates = uniqueCountriesForCurrency(currencyHint);

    if (countryHint) {
      if (!candidates.includes(countryHint)) {
        throw new MobileMoneyNetworkError(
          'UNSUPPORTED_COUNTRY',
          `Country '${countryHint}' is not supported for direct mobile money charge.`,
          { country: countryHint, supported: candidates },
        );
      }
      country = countryHint;
    } else if (candidates.length === 1) {
      country = candidates[0];
    } else {
      throw new MobileMoneyNetworkError(
        'AMBIGUOUS_NUMBER',
        'Could not determine the country of this number. Include the international dial code or specify the country.',
        { candidates },
      );
    }

    national = digits;
  }

  const rules = rulesForCountry(country);
  if (rules.length === 0) {
    throw new MobileMoneyNetworkError(
      'UNSUPPORTED_COUNTRY',
      `Country '${country}' is not supported for direct mobile money charge.`,
      { country, supported: uniqueCountriesForCurrency(currencyHint) },
    );
  }

  const resolvedCurrency = rules[0].currency;

  // The dial code is authoritative; a conflicting currency hint means the caller
  // is trying to charge the wrong currency for that number. Refuse rather than
  // silently charging in a currency the caller did not ask for.
  if (currencyHint && currencyHint !== resolvedCurrency) {
    throw new MobileMoneyNetworkError(
      'UNSUPPORTED_CURRENCY',
      `Number belongs to ${country} (${resolvedCurrency}) but currency '${currencyHint}' was requested.`,
      { country, expectedCurrency: resolvedCurrency, received: currencyHint },
    );
  }

  const [minLength, maxLength] = rules[0].nationalLength;
  if (national.length < minLength || national.length > maxLength) {
    throw new MobileMoneyNetworkError(
      'AMBIGUOUS_NUMBER',
      `Could not determine the country of this number. Expected a national number of ${minLength}${
        maxLength === minLength ? '' : `-${maxLength}`
      } digits for ${country}, received ${national.length}.`,
      {
        country,
        nationalLength: national.length,
        expected: rules[0].nationalLength,
      },
    );
  }

  // 3. Longest-prefix operator match across the country's allocations.
  const prefixMatches = rules
    .flatMap((rule) =>
      rule.prefixes
        .filter((prefix) => national.startsWith(prefix))
        .map((prefix) => ({ rule, prefix })),
    )
    .sort((a, b) => b.prefix.length - a.prefix.length);

  let rule: MobileMoneyNetworkRule | undefined = prefixMatches[0]?.rule;

  // 4. Explicit override — only trusted when prefix deduction fails, so an
  // unambiguous number is never overridden by a stale UI selection.
  if (!rule && input.network) {
    const wanted = normalizeNetworkToken(input.network);
    rule = rules.find(
      (candidate) => normalizeNetworkToken(candidate.network) === wanted,
    );
  }

  if (!rule) {
    throw new MobileMoneyNetworkError(
      'NETWORK_NOT_RESOLVED',
      `Could not determine the mobile money operator for this ${country} number. Please select your operator.`,
      {
        country,
        currency: resolvedCurrency,
        availableNetworks: [
          ...new Set(rules.map((candidate) => candidate.network)),
        ],
      },
    );
  }

  // 5. OTP guard — V1 has no second authorisation step.
  if (rule.requiresAuthorizationCode) {
    throw new MobileMoneyNetworkError(
      'AUTHORIZATION_CODE_REQUIRED',
      `${rule.network} in ${country} requires an authorisation code, which is not supported yet. Please choose another operator.`,
      {
        country,
        network: rule.network,
        availableNetworks: [
          ...new Set(rules.map((candidate) => candidate.network)),
        ],
      },
    );
  }

  const dialCode = rules[0].dialCode;

  return {
    country,
    currency: resolvedCurrency,
    network: rule.network,
    chargeType: rule.chargeType,
    msisdn: `${dialCode}${national}`,
    requiresAuthorizationCode: false,
  };
}
