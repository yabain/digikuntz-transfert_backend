import { BadRequestException, HttpException } from '@nestjs/common';
import {
  MAX_DIRECT_CHARGE_AMOUNT,
  MAX_EMAIL_LENGTH,
  MIN_DIRECT_CHARGE_AMOUNT,
  PRE_CHARGE_REJECTION_CODES,
  buildMobileMoneyCharge,
  isPreChargeRejection,
  readChargeOutcome,
} from './mobile-money-charge.builder';

function captureHttpError(fn: () => unknown): Record<string, unknown> {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const httpError = error as HttpException;
    expect(httpError.getStatus()).toBe(400);
    const response = httpError.getResponse();
    return (typeof response === 'string' ? {} : response) as Record<
      string,
      unknown
    >;
  }

  throw new Error('Expected buildMobileMoneyCharge to throw an HttpException');
}

function detailsOf(response: Record<string, unknown>): Record<string, unknown> {
  return (response.details ?? {}) as Record<string, unknown>;
}

const VALID = {
  txRef: 'txDirect-123',
  amount: 1500,
  currency: 'XAF',
  phone: '237691224472',
  email: 'payer@example.com',
  flow: 'direct_charge' as const,
};

describe('buildMobileMoneyCharge', () => {
  describe('happy path (Cameroon / XAF)', () => {
    it('builds the exact Flutterwave franco payload', () => {
      const built = buildMobileMoneyCharge({ ...VALID, fullname: 'John Doe' });

      expect(built.chargeType).toBe('mobile_money_franco');
      expect(built.body).toEqual({
        tx_ref: 'txDirect-123',
        amount: 1500,
        currency: 'XAF',
        phone_number: '237691224472',
        email: 'payer@example.com',
        fullname: 'John Doe',
        country: 'CM',
        network: 'ORANGEMONEY',
        meta: {
          app: 'digikuntz-payments',
          flow: 'direct_charge',
          authorizationCodeApplied: false,
        },
      });
      expect(built.resolved.country).toBe('CM');
    });

    it('never sends authorization_code (V1 has no OTP step)', () => {
      const built = buildMobileMoneyCharge(VALID);

      expect(built.body).not.toHaveProperty('authorization_code');
    });

    it('defaults the fullname instead of sending an empty string', () => {
      expect(buildMobileMoneyCharge(VALID).body.fullname).toBe('Customer');
      expect(
        buildMobileMoneyCharge({ ...VALID, fullname: '   ' }).body.fullname,
      ).toBe('Customer');
    });

    it('merges caller meta on top of the defaults', () => {
      const built = buildMobileMoneyCharge({
        ...VALID,
        meta: { invoiceId: 'inv-1' },
      });

      expect(built.body.meta).toMatchObject({
        app: 'digikuntz-payments',
        flow: 'direct_charge',
        invoiceId: 'inv-1',
      });
    });
  });

  describe('amount rules', () => {
    it('rounds to an integer', () => {
      expect(
        buildMobileMoneyCharge({ ...VALID, amount: 100.4 }).body.amount,
      ).toBe(100);
      expect(
        buildMobileMoneyCharge({ ...VALID, amount: 100.6 }).body.amount,
      ).toBe(101);
    });

    it('accepts a value that rounds up to the minimum', () => {
      expect(
        buildMobileMoneyCharge({ ...VALID, amount: 99.9 }).body.amount,
      ).toBe(MIN_DIRECT_CHARGE_AMOUNT);
    });

    it('rejects an amount below the Flutterwave minimum', () => {
      const response = captureHttpError(() =>
        buildMobileMoneyCharge({ ...VALID, amount: 99 }),
      );

      expect(response.code).toBe('AMOUNT_BELOW_MIN');
      expect(detailsOf(response)).toMatchObject({
        minimum: MIN_DIRECT_CHARGE_AMOUNT,
      });
    });

    it('rejects a non-positive or non-numeric amount', () => {
      expect(
        captureHttpError(() => buildMobileMoneyCharge({ ...VALID, amount: 0 }))
          .code,
      ).toBe('INVALID_AMOUNT');
      expect(
        captureHttpError(() =>
          buildMobileMoneyCharge({ ...VALID, amount: Number.NaN }),
        ).code,
      ).toBe('INVALID_AMOUNT');
    });

    it('rejects an absurd amount, the only bound on the untyped /fw/direct-charge body', () => {
      // `POST /fw/direct-charge` keeps `data: any` for backward compatibility, so
      // the global ValidationPipe cannot bound `estimation`. This ceiling is the
      // last line of defence before Flutterwave and the payin row.
      const response = captureHttpError(() =>
        buildMobileMoneyCharge({
          ...VALID,
          amount: MAX_DIRECT_CHARGE_AMOUNT + 1,
        }),
      );

      expect(response.code).toBe('AMOUNT_ABOVE_MAX');
      expect(detailsOf(response)).toMatchObject({
        maximum: MAX_DIRECT_CHARGE_AMOUNT,
      });
    });

    it('still accepts the maximum itself', () => {
      expect(
        buildMobileMoneyCharge({ ...VALID, amount: MAX_DIRECT_CHARGE_AMOUNT })
          .body.amount,
      ).toBe(MAX_DIRECT_CHARGE_AMOUNT);
    });

    it('rejects an unbounded email instead of forwarding it upstream', () => {
      const response = captureHttpError(() =>
        buildMobileMoneyCharge({
          ...VALID,
          email: `${'a'.repeat(MAX_EMAIL_LENGTH)}@example.com`,
        }),
      );

      expect(response.code).toBe('INVALID_EMAIL');
    });
  });

  describe('required inputs', () => {
    it('requires a tx_ref', () => {
      expect(
        captureHttpError(() =>
          buildMobileMoneyCharge({ ...VALID, txRef: '  ' }),
        ).code,
      ).toBe('MISSING_TX_REF');
    });

    it('requires an email', () => {
      expect(
        captureHttpError(() => buildMobileMoneyCharge({ ...VALID, email: '' }))
          .code,
      ).toBe('MISSING_EMAIL');
    });

    it('rejects a currency outside the direct charge set', () => {
      const response = captureHttpError(() =>
        buildMobileMoneyCharge({ ...VALID, currency: 'TZS' }),
      );

      expect(response.code).toBe('UNSUPPORTED_CURRENCY');
      expect(detailsOf(response).supported).toEqual(
        expect.arrayContaining(['XAF', 'XOF', 'NGN', 'GHS', 'UGX', 'RWF']),
      );
    });

    it('surfaces resolver failures as a 400 with the resolver code', () => {
      const response = captureHttpError(() =>
        buildMobileMoneyCharge({ ...VALID, phone: '237660123456' }),
      );

      expect(response.code).toBe('NETWORK_NOT_RESOLVED');
      expect(detailsOf(response).availableNetworks).toEqual(
        expect.arrayContaining(['MTN', 'ORANGEMONEY']),
      );
    });

    it('surfaces the OTP limitation as a 400', () => {
      const response = captureHttpError(() =>
        buildMobileMoneyCharge({
          ...VALID,
          currency: 'XOF',
          phone: '22670000000',
          network: 'ORANGEMONEY',
        }),
      );

      expect(response.code).toBe('AUTHORIZATION_CODE_REQUIRED');
    });
  });

  describe('country and network come from the number, never from the currency', () => {
    it('resolves a Senegalese number as SN/XOF, not CM/XAF', () => {
      const built = buildMobileMoneyCharge({
        ...VALID,
        currency: 'XOF',
        phone: '221770000000',
        network: 'WAVE',
      });

      expect(built.body.country).toBe('SN');
      expect(built.body.currency).toBe('XOF');
      expect(built.body.network).toBe('WAVE');
    });

    it('refuses a number whose country contradicts the requested currency', () => {
      const response = captureHttpError(() =>
        buildMobileMoneyCharge({ ...VALID, currency: 'XOF' }),
      );

      expect(response.code).toBe('UNSUPPORTED_CURRENCY');
    });
  });

  describe('charge type per currency', () => {
    it.each([
      ['CM', 'XAF', '237691224472', undefined, 'mobile_money_franco'],
      ['GH', 'GHS', '233540000000', 'MTN', 'mobile_money_ghana'],
      ['NG', 'NGN', '2348031234567', 'MTN', 'mobile_money_nigeria'],
      ['UG', 'UGX', '256770000000', 'MTN', 'mobile_money_uganda'],
      ['RW', 'RWF', '250780000000', 'MTN', 'mobile_money_rwanda'],
    ])(
      'maps %s/%s to %s',
      (_country, currency, phone, network, expectedChargeType) => {
        const built = buildMobileMoneyCharge({
          ...VALID,
          currency,
          phone,
          network,
        });

        expect(built.chargeType).toBe(expectedChargeType);
      },
    );
  });

  describe('optional fraud-scoring fields', () => {
    it('omits client_ip and device_fingerprint when unknown', () => {
      const built = buildMobileMoneyCharge(VALID);

      expect(built.body).not.toHaveProperty('client_ip');
      expect(built.body).not.toHaveProperty('device_fingerprint');
    });

    it('includes them when provided', () => {
      const built = buildMobileMoneyCharge({
        ...VALID,
        clientIp: '154.123.220.1',
        deviceFingerprint: '62wd23423rq324323qew1',
      });

      expect(built.body.client_ip).toBe('154.123.220.1');
      expect(built.body.device_fingerprint).toBe('62wd23423rq324323qew1');
    });

    it('treats blank values as absent', () => {
      const built = buildMobileMoneyCharge({
        ...VALID,
        clientIp: '   ',
        deviceFingerprint: '',
      });

      expect(built.body).not.toHaveProperty('client_ip');
      expect(built.body).not.toHaveProperty('device_fingerprint');
    });

    it('unwraps the IPv4-mapped IPv6 form produced behind a proxy', () => {
      const built = buildMobileMoneyCharge({
        ...VALID,
        clientIp: '::ffff:154.123.220.1',
      });

      expect(built.body.client_ip).toBe('154.123.220.1');
    });

    it('drops an implausible value instead of sending it to Flutterwave', () => {
      // An invalid client_ip makes Flutterwave reject the whole charge, so it is
      // better to omit the field entirely.
      const built = buildMobileMoneyCharge({
        ...VALID,
        clientIp: 'not an ip',
      });

      expect(built.body).not.toHaveProperty('client_ip');
    });
  });

  describe('isPreChargeRejection — the fallback safety gate', () => {
    function capture(fn: () => unknown): unknown {
      try {
        fn();
      } catch (error) {
        return error;
      }
      throw new Error('Expected the call to throw');
    }

    it('recognises a validation failure raised before any request', () => {
      const error = capture(() =>
        buildMobileMoneyCharge({ ...VALID, amount: 1 }),
      );

      expect(isPreChargeRejection(error)).toBe(true);
    });

    it('recognises an unresolvable operator as a pre-charge failure', () => {
      const error = capture(() =>
        buildMobileMoneyCharge({ ...VALID, phone: '237660123456' }),
      );

      expect(isPreChargeRejection(error)).toBe(true);
    });

    it('recognises an OTP-only operator as a pre-charge failure', () => {
      const error = capture(() =>
        buildMobileMoneyCharge({
          ...VALID,
          currency: 'XOF',
          phone: '22670000000',
          network: 'ORANGEMONEY',
        }),
      );

      expect(isPreChargeRejection(error)).toBe(true);
    });

    it('does NOT treat a transport/upstream failure as pre-charge', () => {
      // Falling back here would risk a second payment intent while the first
      // charge may already exist upstream.
      expect(isPreChargeRejection(new Error('socket hang up'))).toBe(false);
      expect(
        isPreChargeRejection(
          new HttpException(
            {
              message: 'Flutterwave temporary unavailable',
              code: 'FW_UPSTREAM_5XX',
            },
            502,
          ),
        ),
      ).toBe(false);
    });

    it('does not treat an unlabelled 400 as pre-charge', () => {
      expect(isPreChargeRejection(new BadRequestException('nope'))).toBe(false);
    });

    it('treats the disabled feature flag as pre-charge, making the rollback lever real', () => {
      // With DIRECT_CHARGE_ENABLED=false nothing is sent upstream, so invoice and
      // payment-request must be free to use the hosted checkout again — this is
      // the whole point of the flag.
      const error = new HttpException(
        {
          message: 'Direct mobile-money charge is currently disabled.',
          code: 'DIRECT_CHARGE_DISABLED',
        },
        400,
      );

      expect(isPreChargeRejection(error)).toBe(true);
    });

    it('classifies every code the builder can actually emit', () => {
      // Guards against adding a validation to the builder without telling the
      // fallback gate about it.
      expect([...PRE_CHARGE_REJECTION_CODES]).toEqual(
        expect.arrayContaining([
          'MISSING_TX_REF',
          'MISSING_EMAIL',
          'INVALID_EMAIL',
          'INVALID_AMOUNT',
          'AMOUNT_BELOW_MIN',
          'AMOUNT_ABOVE_MAX',
          'UNSUPPORTED_CURRENCY',
          'NETWORK_NOT_RESOLVED',
          'AUTHORIZATION_CODE_REQUIRED',
          'DIRECT_CHARGE_DISABLED',
        ]),
      );
      expect(PRE_CHARGE_REJECTION_CODES).not.toContain('FW_UPSTREAM_5XX');
    });
  });
});

describe('readChargeOutcome', () => {
  it('narrows the four outcomes a caller may act on', () => {
    expect(readChargeOutcome('successful')).toBe('successful');
    expect(readChargeOutcome('failed')).toBe('failed');
    expect(readChargeOutcome('cancelled')).toBe('cancelled');
    expect(readChargeOutcome('pending')).toBe('pending');
  });

  it('returns an empty string for anything else, so nothing is acted upon', () => {
    // Operating on an unrecognised outcome would be a guess about money. The
    // webhook and the cron own the final state, so the caller must do nothing.
    for (const value of [
      undefined,
      null,
      '',
      'FAILED',
      'unknown',
      0,
      42,
      {},
      [],
      ['failed'],
    ]) {
      expect(readChargeOutcome(value)).toBe('');
    }
  });

  it('does not coerce: an object is never stringified into a match', () => {
    // A hostile/unexpected envelope must not be able to fake a terminal outcome
    // through `toString`.
    expect(readChargeOutcome({ toString: () => 'failed' })).toBe('');
  });
});
