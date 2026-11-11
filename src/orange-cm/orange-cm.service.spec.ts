/**
 * Specs du service natif Orange Money Cameroun.
 *
 * Ces méthodes touchent de l'argent : la persistance du `payToken` AVANT
 * `/pay` (réconciliabilité), le cache du token OAuth et le mapping des statuts
 * sont verrouillés ici. Le service est instancié directement avec un `HttpService`
 * simulé (style `payin-route.service.spec.ts` : mocks manuels, pas de DI Nest).
 */
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { OrangeCmService } from './orange-cm.service';

const PATH = 'https://orange.example';
const CREDS = {
  OM_API_PATH: PATH,
  OM_API_USERNAME: 'username',
  OM_API_PASSWORD: 's3cret-password',
  OM_API_X_AUTH_TOKEN: 'x-auth-token-secret',
  OM_API_CHANNELUSERMSISDN: '237600000000',
  OM_API_PIN: '1234',
};

interface HttpCall {
  url: string;
  method: string;
  headers?: Record<string, string>;
  data?: unknown;
}

const TOKEN_RESPONSE = { data: { access_token: 'tok-1', expires_in: 3599 } };

function buildService(overrides?: { request?: jest.Mock }) {
  const request =
    overrides?.request ?? jest.fn().mockReturnValue(of({ data: {} }));
  const http = { request } as unknown as HttpService;
  const service = new OrangeCmService(http);
  service.setCredentials(CREDS);
  return { service, request };
}

/**
 * Mock de `pay` : le premier appel HTTP est le token OAuth (consommé par
 * `getAccessToken`, puis mis en cache), les suivants sont les réponses de
 * `/mp/pay`.
 */
function payRequestMock(payResponse: unknown) {
  return jest
    .fn()
    .mockReturnValueOnce(of(TOKEN_RESPONSE))
    .mockReturnValue(of(payResponse));
}

/** Erreur en forme d'erreur axios, dont la `config` porte les secrets. */
function axiosErrorWithSecretConfig(message: string) {
  return {
    message,
    config: {
      headers: {
        Authorization: 'Basic dXNlcm5hbWU6czNjcmV0LXBhc3N3b3Jk', // username:s3cret-password
        'X-AUTH-TOKEN': 'x-auth-token-secret',
      },
      data: 'grant_type=client_credentials',
    },
  };
}

describe('OrangeCmService', () => {
  describe('getAccessToken', () => {
    it('demande un token OAuth client_credentials avec l’en-tête Basic', async () => {
      const { service, request } = buildService();
      request.mockReturnValue(
        of({
          data: { access_token: 'tok-1', expires_in: 3599 },
        }),
      );

      await expect(service.getAccessToken()).resolves.toBe('tok-1');

      const call = request.mock.calls[0][0] as HttpCall;
      expect(call.url).toBe(`${PATH}/token`);
      expect(call.method).toBe('POST');
      expect(call.headers?.Authorization).toBe(
        `Basic ${Buffer.from('username:s3cret-password').toString('base64')}`,
      );
      expect(call.data).toBe('grant_type=client_credentials');
    });

    it('met le token en cache jusqu’à expiration (pas de second appel HTTP)', async () => {
      const { service, request } = buildService();
      request.mockReturnValue(
        of({ data: { access_token: 'tok-1', expires_in: 3599 } }),
      );

      await service.getAccessToken();
      await service.getAccessToken();

      expect(request).toHaveBeenCalledTimes(1);
    });

    it('ré-interroge le provider après expiration du token', async () => {
      const { service, request } = buildService();
      // `expires_in: 1` (1 s) : le cache est expiré dès l'appel suivant.
      request.mockReturnValue(
        of({ data: { access_token: 'tok-1', expires_in: 1 } }),
      );

      await service.getAccessToken();
      await service.getAccessToken();

      expect(request).toHaveBeenCalledTimes(2);
    });

    it('échoue en BAD_GATEWAY sans access_token dans la réponse', async () => {
      const { service } = buildService();

      await expect(service.getAccessToken()).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('ne loggue JAMAIS les credentials portés par la config de la requête', async () => {
      const { service, request } = buildService();
      // Échec HTTP simulé comme l'émet réellement `HttpService` (canal d'erreur
      // de l'observable) — une promesse rejetée ne serait pas consommable par
      // `firstValueFrom` et laisserait une rejection non gérée.
      request.mockReturnValue(
        throwError(() =>
          axiosErrorWithSecretConfig('Request failed with status code 401'),
        ),
      );
      const spy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      let logged = '';
      try {
        await expect(service.getAccessToken()).rejects.toBeInstanceOf(
          HttpException,
        );
        // Lecture AVANT mockRestore() : la restauration vide les appels du spy.
        logged = spy.mock.calls.map((call) => JSON.stringify(call)).join(' ');
      } finally {
        spy.mockRestore();
      }

      expect(logged).toContain('Request failed');
      expect(logged).not.toContain('Basic dXNlcm5hbWU6czNjcmV0LXBhc3N3b3Jk');
      expect(logged).not.toContain('x-auth-token-secret');
      expect(logged).not.toContain('s3cret-password');
    });
  });

  describe('initPay', () => {
    it('retourne le payToken de session', async () => {
      const { service, request } = buildService();
      request.mockReturnValue(
        of({ data: { data: { payToken: 'pay-token-1' } } }),
      );

      await expect(service.initPay('tok-1')).resolves.toEqual({
        payToken: 'pay-token-1',
      });
      expect(request.mock.calls[0][0]).toMatchObject({
        url: `${PATH}/omcoreapis/1.0.2/mp/init`,
        method: 'POST',
        headers: { Authorization: 'Bearer tok-1' },
      });
    });

    it('échoue quand mp/init ne renvoie AUCUN payToken (session inutilisable)', async () => {
      const { service } = buildService();

      const err = await service
        .initPay('tok-1')
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.BAD_GATEWAY,
      );
    });
  });

  describe('pay', () => {
    it('envoie le corps complet de mp/pay (PIN inclus, jamais loggé)', async () => {
      const { service, request } = buildService({
        request: payRequestMock({ data: { status: 'ok' } }),
      });

      await service.pay({
        payToken: 'pay-token-1',
        subscriberMsisdn: '237691224472',
        amount: 5100,
        orderId: 'txOm-1',
        description: 'Paiement facture',
        notifUrl: 'https://api.example/orange-cm/notify',
      });

      // L'appel 0 est le token OAuth ; l'appel 1 est /mp/pay.
      const call = request.mock.calls[1][0] as HttpCall & {
        data?: Record<string, unknown>;
      };
      expect(call.url).toBe(`${PATH}/omcoreapis/1.0.2/mp/pay`);
      expect(call.headers).toMatchObject({
        Authorization: 'Bearer tok-1',
        'X-AUTH-TOKEN': 'x-auth-token-secret',
      });
      expect(call.data).toEqual({
        notifUrl: 'https://api.example/orange-cm/notify',
        channelUserMsisdn: '237600000000',
        amount: '5100',
        subscriberMsisdn: '237691224472',
        pin: '1234',
        orderId: 'txOm-1',
        description: 'Paiement facture',
        payToken: 'pay-token-1',
      });
    });

    it('un 2xx est une REQUÊTE de débit partie, pas un paiement confirmé', async () => {
      const { service } = buildService({
        request: payRequestMock({ data: { status: 'ok' } }),
      });

      await expect(
        service.pay({
          payToken: 'pay-token-1',
          subscriberMsisdn: '237691224472',
          amount: 100,
          orderId: 'tx-1',
          description: 'desc',
          notifUrl: 'https://api.example/orange-cm/notify',
        }),
      ).resolves.toBeUndefined();
    });

    it('envoie en 400 une erreur métier retournée par Orange (statut FAILED)', async () => {
      const request = jest
        .fn()
        .mockReturnValueOnce(of(TOKEN_RESPONSE))
        .mockReturnValue(
          throwError(() => ({
            response: {
              data: {
                data: { status: 'FAILED', message: 'Fonds insuffisants' },
              },
            },
          })),
        );
      const { service } = buildService({ request });

      const err = await service
        .pay({
          payToken: 'pay-token-1',
          subscriberMsisdn: '237691224472',
          amount: 500,
          orderId: 'tx-1',
          description: 'desc',
          notifUrl: 'https://api.example/orange-cm/notify',
        })
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('mapStatusToLocal', () => {
    it('mappe les statuts natifs sur le modèle local', () => {
      expect(OrangeCmService.mapStatusToLocal('SUCCESSFULL')).toBe(
        'successful',
      );
      expect(OrangeCmService.mapStatusToLocal('SUCCESS')).toBe('successful');
      expect(OrangeCmService.mapStatusToLocal('FAILED')).toBe('failed');
      expect(OrangeCmService.mapStatusToLocal('EXPIRED')).toBe('cancelled');
      expect(OrangeCmService.mapStatusToLocal('CANCELLED')).toBe('cancelled');
      expect(OrangeCmService.mapStatusToLocal('PENDING')).toBe('pending');
      expect(OrangeCmService.mapStatusToLocal('')).toBe('pending');
      expect(OrangeCmService.mapStatusToLocal('INCONNU')).toBe('pending');
    });
  });
});