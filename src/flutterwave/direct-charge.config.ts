import { ConfigService } from '@nestjs/config';

/**
 * Feature flags for the direct mobile-money charge path.
 *
 * `DIRECT_CHARGE_ENABLED` is the master rollback lever for the whole feature:
 * leaving it unset (or `false`) restores the pre-existing hosted-checkout
 * behaviour for every entrypoint without a code change and without a migration.
 */
export const DIRECT_CHARGE_ENABLED_KEY = 'DIRECT_CHARGE_ENABLED';
export const DIRECT_CHARGE_FALLBACK_HOSTED_KEY =
  'DIRECT_CHARGE_FALLBACK_HOSTED';
export const DIRECT_CHARGE_CLOSE_MINUTES_KEY = 'DIRECT_CHARGE_CLOSE_MINUTES';

export const DEFAULT_DIRECT_CHARGE_ENABLED = false;
export const DEFAULT_DIRECT_CHARGE_FALLBACK_HOSTED = true;
export const DEFAULT_DIRECT_CHARGE_CLOSE_MINUTES = 30;

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

function readRaw(config: ConfigService | undefined, key: string): unknown {
  if (!config || typeof config.get !== 'function') return undefined;
  return config.get<string>(key);
}

/**
 * Lenient boolean parsing: accepts the truthy/falsy spellings commonly used in
 * `.env` files and falls back to `fallback` for anything unrecognised, so a typo
 * can never silently enable a money-moving path.
 */
export function parseBooleanFlag(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') return fallback;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  return fallback;
}

/** Parses a strictly-positive number of minutes, falling back otherwise. */
export function parsePositiveMinutes(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return Math.floor(parsed);
}

/** Master switch for the direct charge path. Defaults to `false` (safe). */
export function isDirectChargeEnabled(config: ConfigService): boolean {
  return parseBooleanFlag(
    readRaw(config, DIRECT_CHARGE_ENABLED_KEY),
    DEFAULT_DIRECT_CHARGE_ENABLED,
  );
}

/**
 * Allows falling back to the hosted checkout when the direct path cannot be
 * used for reasons known *before* any Flutterwave charge is issued. It must
 * never permit a fallback once a charge call has been made.
 */
export function isHostedFallbackEnabled(config: ConfigService): boolean {
  return parseBooleanFlag(
    readRaw(config, DIRECT_CHARGE_FALLBACK_HOSTED_KEY),
    DEFAULT_DIRECT_CHARGE_FALLBACK_HOSTED,
  );
}

/**
 * How long a direct charge may stay `pending` before the payin cron closes it.
 * Kept much shorter than the hosted window because a direct charge has no
 * reusable link to retry.
 */
export function getDirectChargeCloseMinutes(config: ConfigService): number {
  return parsePositiveMinutes(
    readRaw(config, DIRECT_CHARGE_CLOSE_MINUTES_KEY),
    DEFAULT_DIRECT_CHARGE_CLOSE_MINUTES,
  );
}
