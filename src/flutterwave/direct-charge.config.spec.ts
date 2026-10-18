import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DIRECT_CHARGE_CLOSE_MINUTES,
  DEFAULT_DIRECT_CHARGE_ENABLED,
  DEFAULT_DIRECT_CHARGE_FALLBACK_HOSTED,
  getDirectChargeCloseMinutes,
  isDirectChargeEnabled,
  isHostedFallbackEnabled,
  parseBooleanFlag,
  parsePositiveMinutes,
} from './direct-charge.config';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('direct-charge.config', () => {
  describe('parseBooleanFlag', () => {
    it('accepts the truthy spellings used in .env files', () => {
      ['true', 'TRUE', '1', 'yes', 'on', ' true '].forEach((value) => {
        expect(parseBooleanFlag(value, false)).toBe(true);
      });
    });

    it('accepts the falsy spellings', () => {
      ['false', 'FALSE', '0', 'no', 'off'].forEach((value) => {
        expect(parseBooleanFlag(value, true)).toBe(false);
      });
    });

    it('falls back for unrecognised values instead of guessing', () => {
      expect(parseBooleanFlag('maybe', true)).toBe(true);
      expect(parseBooleanFlag('maybe', false)).toBe(false);
      expect(parseBooleanFlag(undefined, true)).toBe(true);
      expect(parseBooleanFlag(null, false)).toBe(false);
      expect(parseBooleanFlag('', true)).toBe(true);
    });

    it('passes real booleans through', () => {
      expect(parseBooleanFlag(true, false)).toBe(true);
      expect(parseBooleanFlag(false, true)).toBe(false);
    });
  });

  describe('parsePositiveMinutes', () => {
    it('parses a positive number of minutes', () => {
      expect(parsePositiveMinutes('45', 30)).toBe(45);
      expect(parsePositiveMinutes(45.7, 30)).toBe(45);
    });

    it('falls back for zero, negatives and garbage', () => {
      expect(parsePositiveMinutes('0', 30)).toBe(30);
      expect(parsePositiveMinutes('-5', 30)).toBe(30);
      expect(parsePositiveMinutes('abc', 30)).toBe(30);
      expect(parsePositiveMinutes(undefined, 30)).toBe(30);
    });
  });

  describe('flags default to the safe values', () => {
    it('disables the direct charge path by default', () => {
      expect(isDirectChargeEnabled(configWith({}))).toBe(
        DEFAULT_DIRECT_CHARGE_ENABLED,
      );
      expect(DEFAULT_DIRECT_CHARGE_ENABLED).toBe(false);
    });

    it('enables the hosted fallback by default', () => {
      expect(isHostedFallbackEnabled(configWith({}))).toBe(
        DEFAULT_DIRECT_CHARGE_FALLBACK_HOSTED,
      );
      expect(DEFAULT_DIRECT_CHARGE_FALLBACK_HOSTED).toBe(true);
    });

    it('defaults the close window', () => {
      expect(getDirectChargeCloseMinutes(configWith({}))).toBe(
        DEFAULT_DIRECT_CHARGE_CLOSE_MINUTES,
      );
    });

    it('survives a missing ConfigService', () => {
      const undefinedConfig = undefined as unknown as ConfigService;

      expect(isDirectChargeEnabled(undefinedConfig)).toBe(false);
      expect(isHostedFallbackEnabled(undefinedConfig)).toBe(true);
      expect(getDirectChargeCloseMinutes(undefinedConfig)).toBe(
        DEFAULT_DIRECT_CHARGE_CLOSE_MINUTES,
      );
    });
  });

  describe('explicit values win', () => {
    it('reads the three flags from configuration', () => {
      const config = configWith({
        DIRECT_CHARGE_ENABLED: 'true',
        DIRECT_CHARGE_FALLBACK_HOSTED: 'false',
        DIRECT_CHARGE_CLOSE_MINUTES: '15',
      });

      expect(isDirectChargeEnabled(config)).toBe(true);
      expect(isHostedFallbackEnabled(config)).toBe(false);
      expect(getDirectChargeCloseMinutes(config)).toBe(15);
    });

    it('lets a typo never enable the money-moving path', () => {
      const config = configWith({ DIRECT_CHARGE_ENABLED: 'ture' });

      expect(isDirectChargeEnabled(config)).toBe(false);
    });
  });
});
