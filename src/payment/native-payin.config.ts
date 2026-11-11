import { ConfigService } from '@nestjs/config';
import {
  parseBooleanFlag,
  parsePositiveMinutes,
} from 'src/flutterwave/direct-charge.config';

/**
 * Feature flags du chemin de pay-in natif Cameroun (Orange CM / MTN CM).
 *
 * `NATIVE_PAYIN_ENABLED` est le levier de rollback principal : laissé non
 * renseigné (ou `false`), la méthode payeur qui pointe vers une passerelle
 * `orange_cm`/`mtn_cm` continue d'emprunter le chemin Flutterwave historique
 * (direct ou hébergé) sans changement de code ni migration.
 *
 * Le parsing booléen est réutilisé depuis `direct-charge.config.ts` afin qu'une
 * typo ne puisse jamais activer silencieusement un chemin qui débite.
 */
export const NATIVE_PAYIN_ENABLED_KEY = 'NATIVE_PAYIN_ENABLED';
export const NATIVE_CM_CLOSE_MINUTES_KEY = 'NATIVE_CM_CLOSE_MINUTES';

export const DEFAULT_NATIVE_PAYIN_ENABLED = false;
export const DEFAULT_NATIVE_CM_CLOSE_MINUTES = 30;

function readRaw(config: ConfigService | undefined, key: string): unknown {
  if (!config || typeof config.get !== 'function') return undefined;
  return config.get<string>(key);
}

/** Master switch du chemin natif Cameroun. Défaut : `false` (sûr). */
export function isNativePayinEnabled(config: ConfigService): boolean {
  return parseBooleanFlag(
    readRaw(config, NATIVE_PAYIN_ENABLED_KEY),
    DEFAULT_NATIVE_PAYIN_ENABLED,
  );
}

/**
 * Fenêtre pendant laquelle un payin natif peut rester `pending` avant que le
 * cron de réconciliation ne le clôture. Un débit natif n'a pas de lien
 * réutilisable (push USSD / app) : la fenêtre courte évite de laisser le payeur
 * bloqué sur un loader et de gonfler la file.
 */
export function getNativeCmCloseMinutes(config: ConfigService): number {
  return parsePositiveMinutes(
    readRaw(config, NATIVE_CM_CLOSE_MINUTES_KEY),
    DEFAULT_NATIVE_CM_CLOSE_MINUTES,
  );
}