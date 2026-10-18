import {
  MOBILE_MONEY_NETWORKS,
  MobileMoneyNetworkError,
  MobileMoneyNetworkErrorCode,
  normalizeNetworkToken,
  resolveMobileMoneyNetwork,
} from './mobile-money-network.util';

function expectFailure(
  input: Parameters<typeof resolveMobileMoneyNetwork>[0],
  code: MobileMoneyNetworkErrorCode,
): MobileMoneyNetworkError {
  try {
    resolveMobileMoneyNetwork(input);
  } catch (error) {
    expect(error).toBeInstanceOf(MobileMoneyNetworkError);
    const networkError = error as MobileMoneyNetworkError;
    expect(networkError.code).toBe(code);
    return networkError;
  }

  throw new Error(`Expected resolveMobileMoneyNetwork to fail with ${code}`);
}

describe('resolveMobileMoneyNetwork', () => {
  describe('Cameroon (XAF) — the fully populated allocation table', () => {
    it.each([
      ['237650123456', 'MTN'],
      ['237654123456', 'MTN'],
      ['237670123456', 'MTN'],
      ['237679123456', 'MTN'],
      ['237680123456', 'MTN'],
      ['237685123456', 'MTN'],
      ['237655123456', 'ORANGEMONEY'],
      ['237659123456', 'ORANGEMONEY'],
      ['237686123456', 'ORANGEMONEY'],
      ['237689123456', 'ORANGEMONEY'],
      ['237690123456', 'ORANGEMONEY'],
      ['237699123456', 'ORANGEMONEY'],
    ])('maps %s to %s', (phone, expectedNetwork) => {
      const resolved = resolveMobileMoneyNetwork({ phone, currency: 'XAF' });

      expect(resolved.network).toBe(expectedNetwork);
      expect(resolved.country).toBe('CM');
      expect(resolved.currency).toBe('XAF');
      expect(resolved.chargeType).toBe('mobile_money_franco');
      expect(resolved.msisdn).toBe(phone);
      expect(resolved.requiresAuthorizationCode).toBe(false);
    });

    it('does not fall through to a neighbouring allocation (boundary guard)', () => {
      // 654 → MTN, 655 → Orange: the single-digit boundary must not leak.
      expect(
        resolveMobileMoneyNetwork({ phone: '237654123456', currency: 'XAF' })
          .network,
      ).toBe('MTN');
      expect(
        resolveMobileMoneyNetwork({ phone: '237655123456', currency: 'XAF' })
          .network,
      ).toBe('ORANGEMONEY');
      // 685 → MTN, 686 → Orange.
      expect(
        resolveMobileMoneyNetwork({ phone: '237685123456', currency: 'XAF' })
          .network,
      ).toBe('MTN');
      expect(
        resolveMobileMoneyNetwork({ phone: '237686123456', currency: 'XAF' })
          .network,
      ).toBe('ORANGEMONEY');
      // 689 → Orange, 690 → Orange (same operator, still must not fail).
      expect(
        resolveMobileMoneyNetwork({ phone: '237690123456', currency: 'XAF' })
          .network,
      ).toBe('ORANGEMONEY');
    });

    it('rejects an unallocated Cameroon prefix instead of guessing', () => {
      // 66x is not allocated by the repository's own MTN/Orange rules.
      expectFailure(
        { phone: '237660123456', currency: 'XAF' },
        'NETWORK_NOT_RESOLVED',
      );
    });

    it('resolves a local (dial-code-less) number from the currency hint', () => {
      const resolved = resolveMobileMoneyNetwork({
        phone: '691224472',
        currency: 'XAF',
      });

      expect(resolved.country).toBe('CM');
      expect(resolved.network).toBe('ORANGEMONEY');
      // The MSISDN handed to Flutterwave is always country-prefixed.
      expect(resolved.msisdn).toBe('237691224472');
    });

    it('tolerates formatting characters in the input', () => {
      const resolved = resolveMobileMoneyNetwork({
        phone: '+237 691 22 44 72',
        currency: 'XAF',
      });

      expect(resolved.msisdn).toBe('237691224472');
    });
  });

  describe('dial code inference', () => {
    it.each([
      ['237691224472', 'CM'],
      ['2250700000000', 'CI'],
      ['22670000000', 'BF'],
      ['221770000000', 'SN'],
      ['2348031234567', 'NG'],
      ['233540000000', 'GH'],
      ['256770000000', 'UG'],
      ['250780000000', 'RW'],
    ])('infers %s as %s', (phone, country) => {
      // No currency hint: the dial code alone must be enough to pick the country
      // (operator deduction may still be unavailable, which is a separate code).
      try {
        expect(resolveMobileMoneyNetwork({ phone }).country).toBe(country);
      } catch (error) {
        const networkError = error as MobileMoneyNetworkError;
        expect(networkError).toBeInstanceOf(MobileMoneyNetworkError);
        expect([
          'NETWORK_NOT_RESOLVED',
          'AUTHORIZATION_CODE_REQUIRED',
        ]).toContain(networkError.code);
        expect(networkError.details.country).toBe(country);
      }
    });
  });

  describe('explicit network override', () => {
    it('is accepted when prefix deduction is unavailable', () => {
      const resolved = resolveMobileMoneyNetwork({
        phone: '221770000000',
        currency: 'XOF',
        network: 'wave',
      });

      expect(resolved.country).toBe('SN');
      expect(resolved.network).toBe('WAVE');
      expect(resolved.msisdn).toBe('221770000000');
    });

    it('normalises spelling variants', () => {
      const resolved = resolveMobileMoneyNetwork({
        phone: '221770000000',
        currency: 'XOF',
        network: 'Orange Money',
      });

      expect(resolved.network).toBe('ORANGEMONEY');
    });

    it('never overrides an unambiguous, deduced operator', () => {
      const resolved = resolveMobileMoneyNetwork({
        phone: '237650123456',
        currency: 'XAF',
        network: 'ORANGEMONEY',
      });

      expect(resolved.network).toBe('MTN');
    });

    it('rejects an operator that does not belong to the country', () => {
      const error = expectFailure(
        { phone: '221770000000', currency: 'XOF', network: 'GLO' },
        'NETWORK_NOT_RESOLVED',
      );

      expect(error.details.availableNetworks).toEqual(
        expect.arrayContaining(['ORANGEMONEY', 'FREE', 'WAVE']),
      );
    });

    it('accepts the short provider codes the frontend sends', () => {
      // Nigeria has no prefix table yet, so the explicit hint is the only path.
      const resolved = resolveMobileMoneyNetwork({
        phone: '2348031234567',
        currency: 'NGN',
        network: 'momo',
      });

      expect(resolved.network).toBe('MTN');
      expect(resolved.chargeType).toBe('mobile_money_nigeria');
    });
  });

  describe('fail-fast guards', () => {
    it('rejects a phone that is too short', () => {
      expectFailure({ phone: '123' }, 'INVALID_PHONE');
    });

    it('rejects an unsupported currency', () => {
      const error = expectFailure(
        { phone: '237691224472', currency: 'TZS' },
        'UNSUPPORTED_CURRENCY',
      );

      expect(error.details.supported).toEqual(
        expect.arrayContaining(['XAF', 'XOF', 'NGN', 'GHS', 'UGX', 'RWF']),
      );
    });

    it('rejects a currency that contradicts the number dial code', () => {
      expectFailure(
        { phone: '237691224472', currency: 'XOF' },
        'UNSUPPORTED_CURRENCY',
      );
    });

    it('rejects an unsupported country hint', () => {
      expectFailure(
        { phone: '691224472', currency: 'XAF', country: 'ZZ' },
        'UNSUPPORTED_COUNTRY',
      );
    });

    it('refuses an ambiguous number rather than picking arbitrarily', () => {
      expectFailure({ phone: '691224472' }, 'AMBIGUOUS_NUMBER');
    });

    it('validates the national number length for the country', () => {
      // Correct dial code, one digit short for Cameroon.
      expectFailure(
        { phone: '23765012345', currency: 'XAF' },
        'AMBIGUOUS_NUMBER',
      );
    });

    it('refuses Burkina Faso + ORANGEMONEY (OTP not implemented in V1)', () => {
      const error = expectFailure(
        { phone: '22670000000', currency: 'XOF', network: 'ORANGEMONEY' },
        'AUTHORIZATION_CODE_REQUIRED',
      );

      expect(error.details.network).toBe('ORANGEMONEY');
    });
  });

  describe('KES / M-Pesa regression guard', () => {
    it('has no KES rule, so normalizeKesMsisdnStrict stays the KES authority', () => {
      // `String(...)` defeats TypeScript's union narrowing on purpose: the
      // compiler already proves `currency` can never be 'KES', and this asserts
      // the same guarantee at runtime so a widened type or a bad table row is
      // still caught.
      expect(
        MOBILE_MONEY_NETWORKS.some((rule) => String(rule.currency) === 'KES'),
      ).toBe(false);
      expect(MOBILE_MONEY_NETWORKS.some((rule) => rule.country === 'KE')).toBe(
        false,
      );
    });

    it('refuses a KES resolution attempt', () => {
      expectFailure(
        { phone: '254712345678', currency: 'KES' },
        'UNSUPPORTED_CURRENCY',
      );
    });
  });

  describe('table integrity', () => {
    it('never declares an allocation with the dial code inside the prefixes', () => {
      MOBILE_MONEY_NETWORKS.forEach((rule) => {
        rule.prefixes.forEach((prefix) => {
          expect(prefix.startsWith(rule.dialCode)).toBe(false);
          expect(prefix).toMatch(/^\d+$/);
        });
      });
    });

    it('keeps a single currency per country', () => {
      const currenciesByCountry = new Map<string, Set<string>>();

      MOBILE_MONEY_NETWORKS.forEach((rule) => {
        const set = currenciesByCountry.get(rule.country) ?? new Set<string>();
        set.add(rule.currency);
        currenciesByCountry.set(rule.country, set);
      });

      currenciesByCountry.forEach((currencies, country) => {
        expect([...currencies]).toHaveLength(1);
        expect(country).toMatch(/^[A-Z]{2}$/);
      });
    });

    it('never declares a prefix for another operator of the same country', () => {
      MOBILE_MONEY_NETWORKS.forEach((rule) => {
        MOBILE_MONEY_NETWORKS.filter(
          (other) => other.country === rule.country && other !== rule,
        ).forEach((other) => {
          const overlap = rule.prefixes.filter((prefix) =>
            other.prefixes.includes(prefix),
          );
          expect(overlap).toEqual([]);
        });
      });
    });
  });

  describe('normalizeNetworkToken', () => {
    it('strips separators and upper-cases', () => {
      expect(normalizeNetworkToken('orange-money')).toBe('ORANGEMONEY');
      expect(normalizeNetworkToken(' mtn ')).toBe('MTN');
    });

    it('maps common aliases', () => {
      expect(normalizeNetworkToken('Orange')).toBe('ORANGEMONEY');
      expect(normalizeNetworkToken('Telecel')).toBe('VODAFONE');
    });

    it('maps the short codes the frontend actually sends', () => {
      // `mapProviderToBackend()` produces these; without the aliases every
      // explicit-operator request would fail with NETWORK_NOT_RESOLVED.
      expect(normalizeNetworkToken('om')).toBe('ORANGEMONEY');
      expect(normalizeNetworkToken('atl')).toBe('AIRTELTIGO');
      expect(normalizeNetworkToken('momo')).toBe('MTN');
    });

    it('is safe on empty input', () => {
      expect(normalizeNetworkToken(undefined)).toBe('');
    });
  });
});
