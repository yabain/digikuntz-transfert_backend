import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { GatewayLoaderService } from 'src/payment/gateway-loader.service';
import { FlutterwaveApiService } from './flutterwave-api.service';

const SECRET = 'FLWSECK_TEST-000000000000000000000000';
const BASE = 'https://api.flutterwave.com/v3';

type GatewayCreds = Record<string, string | undefined>;

interface HttpCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
}

/** Builds a gateway config the way GatewayLoaderService returns it. */
const gatewayConfig = (creds: GatewayCreds) => ({
  _id: 'gw-1',
  name: 'Flutterwave XAF',
  type: 'flutterwave',
  currency: 'XAF',
  credentials: {
    secretKey: '',
    publicKey: '',
    secretHash: '',
    ...creds,
  },
});

/** Mimics the axios error shape expected by sanitizeFlutterwaveError. */
const axiosError = (status: number, data: unknown) => ({
  message: `Request failed with status code ${status}`,
  response: { status, data },
});

/** Captures the rejection so we can assert on the HttpException itself. */
async function capture(fn: () => Promise<unknown>): Promise<HttpException> {
  try {
    await fn();
  } catch (e: unknown) {
    return e as HttpException;
  }
  throw new Error('Expected the call to throw, but it resolved');
}

describe('FlutterwaveApiService', () => {
  let service: FlutterwaveApiService;
  let http: { request: jest.Mock<unknown, [HttpCall]> };
  let gatewayLoader: { getConfig: jest.Mock };

  const sentCall = (index = 0): HttpCall => http.request.mock.calls[index][0];

  beforeEach(async () => {
    http = { request: jest.fn<unknown, [HttpCall]>() };
    gatewayLoader = { getConfig: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FlutterwaveApiService,
        { provide: HttpService, useValue: http },
        { provide: GatewayLoaderService, useValue: gatewayLoader },
      ],
    }).compile();

    service = moduleRef.get(FlutterwaveApiService);
  });

  describe('credential resolution', () => {
    it('prefers FLUTTERWAVE_SECRET_KEY over the generic secretKey', async () => {
      gatewayLoader.getConfig.mockResolvedValue(
        gatewayConfig({
          FLUTTERWAVE_SECRET_KEY: SECRET,
          secretKey: 'fallback',
        }),
      );

      await expect(service.getSecretKey('XAF')).resolves.toBe(SECRET);
      expect(gatewayLoader.getConfig).toHaveBeenCalledWith('XAF');
    });

    it('falls back to secretKey and defaults the currency to XAF', async () => {
      gatewayLoader.getConfig.mockResolvedValue(
        gatewayConfig({ secretKey: SECRET }),
      );

      await expect(service.getSecretKey()).resolves.toBe(SECRET);
      expect(gatewayLoader.getConfig).toHaveBeenCalledWith('XAF');
    });

    it('hasCredentials never throws when the gateway cannot be loaded', async () => {
      gatewayLoader.getConfig.mockRejectedValue(
        new Error('No gateway found for currency "XAF"'),
      );

      await expect(service.hasCredentials('XAF')).resolves.toBe(false);
    });

    it('assertCredentials keeps the exact legacy message', async () => {
      gatewayLoader.getConfig.mockResolvedValue(gatewayConfig({}));

      await expect(service.assertCredentials('XAF')).rejects.toThrow(
        'No Flutterwave gateway credentials found in database',
      );
    });
  });

  describe('transfers', () => {
    beforeEach(() => {
      gatewayLoader.getConfig.mockResolvedValue(
        gatewayConfig({ FLUTTERWAVE_SECRET_KEY: SECRET }),
      );
    });

    it('getTransferById calls /transfers/{id} with the currency secret and unwraps .data', async () => {
      http.request.mockReturnValue(
        of({
          data: { status: 'success', data: { id: 42, status: 'SUCCESSFUL' } },
        }),
      );

      await expect(service.getTransferById(42, 'XAF')).resolves.toEqual({
        id: 42,
        status: 'SUCCESSFUL',
      });

      expect(http.request).toHaveBeenCalledTimes(1);
      const call = sentCall();
      expect(call.method).toBe('get');
      expect(call.url).toBe(`${BASE}/transfers/42`);
      expect(call.headers).toEqual({ Authorization: `Bearer ${SECRET}` });
    });

    it('getTransferByReference normalises the array response to a single transfer', async () => {
      http.request.mockReturnValue(
        of({
          data: { status: 'success', data: [{ id: 1, status: 'SUCCESSFUL' }] },
        }),
      );

      await expect(service.getTransferByReference('ref-1')).resolves.toEqual({
        id: 1,
        status: 'SUCCESSFUL',
      });
      expect(sentCall().params).toEqual({ reference: 'ref-1' });
    });

    it('getTransferByReference returns null on an empty array', async () => {
      http.request.mockReturnValue(
        of({ data: { status: 'success', data: [] } }),
      );

      await expect(service.getTransferByReference('ref-1')).resolves.toBeNull();
    });

    it('createTransfer posts the payload and returns the full envelope', async () => {
      const envelope = {
        status: 'success',
        message: 'Transfer Queued',
        data: { id: 7 },
      };
      http.request.mockReturnValue(of({ data: envelope }));

      await expect(
        service.createTransfer({ amount: 100 }, 'XAF'),
      ).resolves.toEqual(envelope);

      const call = sentCall();
      expect(call.method).toBe('post');
      expect(call.url).toBe(`${BASE}/transfers`);
      expect(call.data).toEqual({ amount: 100 });
    });
  });

  describe('pay-in verification', () => {
    beforeEach(() => {
      gatewayLoader.getConfig.mockResolvedValue(
        gatewayConfig({ FLUTTERWAVE_SECRET_KEY: SECRET }),
      );
      http.request.mockReturnValue(
        of({ data: { data: { status: 'successful' } } }),
      );
    });

    it('verifyPayinById targets the numeric id endpoint', async () => {
      await expect(service.verifyPayinById('123')).resolves.toEqual({
        status: 'successful',
      });
      expect(sentCall().url).toBe(`${BASE}/transactions/123/verify`);
    });

    it('verifyPayinByReference targets verify_by_reference with tx_ref', async () => {
      await expect(service.verifyPayinByReference('tx-1')).resolves.toEqual({
        status: 'successful',
      });
      const call = sentCall();
      expect(call.url).toBe(`${BASE}/transactions/verify_by_reference`);
      expect(call.params).toEqual({ tx_ref: 'tx-1' });
    });
  });

  describe('error mapping', () => {
    beforeEach(() => {
      gatewayLoader.getConfig.mockResolvedValue(
        gatewayConfig({ FLUTTERWAVE_SECRET_KEY: SECRET }),
      );
    });

    it('maps an upstream 401 to 502 so the frontend does not clear the session', async () => {
      http.request.mockReturnValue(
        throwError(() => axiosError(401, { message: 'Invalid key' })),
      );

      const err = await capture(() => service.getTransferById(1));

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(502);
      expect(err.getResponse()).toEqual({ message: 'Invalid key' });
    });

    it('never leaks an upstream HTML page', async () => {
      http.request.mockReturnValue(
        throwError(() => axiosError(502, '<!DOCTYPE html><html>oops</html>')),
      );

      const err = await capture(() => service.getTransferById(1));

      expect(err.getResponse()).toMatchObject({
        message: 'Flutterwave temporary unavailable',
        provider: 'flutterwave',
        code: 'FW_UPSTREAM_5XX',
      });
    });

    it('passes a JSON upstream payload through untouched', async () => {
      http.request.mockReturnValue(
        throwError(() =>
          axiosError(400, { status: 'error', message: 'Invalid account' }),
        ),
      );

      const err = await capture(() => service.createTransfer({}));

      expect(err.getStatus()).toBe(400);
      expect(err.getResponse()).toEqual({
        status: 'error',
        message: 'Invalid account',
      });
    });

    it('falls back to the caller message when the upstream payload is unusable', async () => {
      http.request.mockReturnValue(
        throwError(() => axiosError(500, undefined)),
      );

      const err = await capture(() => service.getTransferById(1));

      expect(err.getStatus()).toBe(502);
      expect(err.getResponse()).toMatchObject({
        message: 'Flutterwave transfer lookup failed',
      });
    });

    it('never calls the API when no credentials are configured', async () => {
      gatewayLoader.getConfig.mockResolvedValue(gatewayConfig({}));

      await expect(service.getTransferById(1)).rejects.toThrow(
        'No Flutterwave gateway credentials found in database',
      );
      expect(http.request).not.toHaveBeenCalled();
    });
  });
});
