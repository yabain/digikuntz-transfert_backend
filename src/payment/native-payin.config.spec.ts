/**
 * Specs des feature flags du chemin natif Cameroun.
 *
 * `parseBooleanFlag`/`parsePositiveMinutes` sont déjà testés dans
 * `direct-charge.config.spec.ts` et réutilisés ici : ces specs vérifient que le
 * chemin natif est INACTIF par défaut (rollback sûr) et que les valeurs
 * explicites gagnent — une typo ne doit jamais pouvoir activer un chemin qui
 * débite.
 */
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_NATIVE_CM_CLOSE_MINUTES,
  DEFAULT_NATIVE_PAYIN_ENABLED,
  getNativeCmCloseMinutes,
  isNativePayinEnabled,
} from './native-payin.config';

function configWith(
  values: Record<string, string | undefined>,
): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('native-payin.config', () => {
  describe('défauts sûrs', () => {
    it('désactive le chemin natif par défaut', () => {
      expect(isNativePayinEnabled(configWith({}))).toBe(false);
      expect(DEFAULT_NATIVE_PAYIN_ENABLED).toBe(false);
    });

    it('définit la fenêtre de clôture native à 30 minutes par défaut', () => {
      expect(getNativeCmCloseMinutes(configWith({}))).toBe(
        DEFAULT_NATIVE_CM_CLOSE_MINUTES,
      );
      expect(DEFAULT_NATIVE_CM_CLOSE_MINUTES).toBe(30);
    });

    it('survit à un ConfigService manquant', () => {
      const undefinedConfig = undefined as unknown as ConfigService;

      expect(isNativePayinEnabled(undefinedConfig)).toBe(false);
      expect(getNativeCmCloseMinutes(undefinedConfig)).toBe(30);
    });
  });

  describe('valeurs explicites gagnent', () => {
    it('lit les deux flags depuis la configuration', () => {
      const config = configWith({
        NATIVE_PAYIN_ENABLED: 'true',
        NATIVE_CM_CLOSE_MINUTES: '15',
      });

      expect(isNativePayinEnabled(config)).toBe(true);
      expect(getNativeCmCloseMinutes(config)).toBe(15);
    });

    it('une typo ne peut jamais activer le chemin natif', () => {
      expect(
        isNativePayinEnabled(configWith({ NATIVE_PAYIN_ENABLED: 'ture' })),
      ).toBe(false);
      expect(
        isNativePayinEnabled(configWith({ NATIVE_PAYIN_ENABLED: 'yes' })),
      ).toBe(true);
    });

    it('rejette une fenêtre invalide au profit du défaut', () => {
      expect(
        getNativeCmCloseMinutes(configWith({ NATIVE_CM_CLOSE_MINUTES: 'abc' })),
      ).toBe(30);
      expect(
        getNativeCmCloseMinutes(configWith({ NATIVE_CM_CLOSE_MINUTES: '-5' })),
      ).toBe(30);
    });
  });
});