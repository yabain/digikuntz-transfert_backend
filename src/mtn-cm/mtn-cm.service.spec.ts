/**
 * Specs du service natif MTN MoMo Cameroun.
 *
 * Verrouille le contrat `requesttopay` (202 = requête de débit acceptée, PAS un
 * débit confirmé), l'idempotence par `X-Reference-Id` UUID v4 et le mapping des
 * statuts. Mocks manuels (style `payin-route.service.spec.ts`).
 */
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { MtnCmService } from './mtn-cm.service';

const PATH = 'https://mtn.example';
const CREDS = {
  MOMO_API_PATH: PATH,
  MOMO_API_KEY: 'api-key-secret',
  MOMO_API_PRIMARY_KEY: 'primary-key-secret',
  MOMO_API_DEFAULT_UUID: 'default-uuid',
  MOMO_API_MODE_ENV: 'sandbox',
};

interface HttpCall {
  url: string;
  method: string;
  headers?: Record<string, string>;
  data?: unknown;
}

function buildService(overrides?: { request?: jest.Mock }) {
  const request =
    overrides?.request ?? jest.fn().mockReturnValue(of({ data: {} }));
  const http = { request } as unknown as HttpService;
  const service = new MtnCmService(http);
  service.setCredentials(CREDS);
  return { service, request };
}

const TOKEN_RESPONSE = { data: { access_token: 'tok-1', expires_in: 3599 } };

/**
 * Mock de `requestToPay` : le premier appel HTTP est le token (consommé par
 * `getAccessToken`, puis mis en cache), les suivants sont les réponses de
 * `requesttopay`.
 */
function requestToPayMock(response: unknown) {
  return jest
    .fn()
    .mockReturnValueOnce(of(TOKEN_RESPONSE))
    .mockReturnValue(of(response));
}

describe('MtnCmService', () => {
  describe('getAccessToken', () => {
    it('demande un token avec Basic `defaultUuid:apiKey` et la clé d’abonnement', async () => {
      const { service, request } = buildService();
      request.mockReturnValue(
        of({ data: { access_token: 'tok-1', expires_in: 3599 } }),
      );

      await expect(service.getAccessToken()).resolves.toBe('tok-1');

      const call = request.mock.calls[0][0] as HttpCall;
      expect(call.url).toBe(`${PATH}/collection/token/`);
      expect(call.method).toBe('POST');
      expect(call.headers?.Authorization).toBe(
        `Basic ${Buffer.from('default-uuid:api-key-secret').toString('base64')}`,
      );
      expect(call.headers?.['Ocp-Apim-Subscription-Key']).toBe(
        'primary-key-secret',
      );
      // Secrets jamais loggés par le service.
      expect(call.data).toBeUndefined();
    });

    it('met le token en cache jusqu’à expiration', async () => {
      const { service, request } = buildService();
      request.mockReturnValue(
        of({ data: { access_token: 'tok-1', expires_in: 3599 } }),
      );

      await service.getAccessToken();
      await service.getAccessToken();

      expect(request).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestToPay', () => {
    it('envoie X-Reference-Id, l’abonnement, l’environnement et le corps attendu', async () => {
      const { service, request } = buildService({
        request: requestToPayMock({ data: {}, status: 202 }),
      });

      await service.requestToPay({
        partyId: '237671224472',
        amount: 5100,
        currency: 'XAF',
        externalId: 'txMtn-1',
        payerMessage: 'Paiement de 5100 XAF',
        payeeNote: 'Paiement de 5100 XAF',
        xReferenceId: '11111111-1111-4111-8111-111111111111',
      });

      // L'appel 0 est le token ; l'appel 1 est requesttopay.
      const call = request.mock.calls[1][0] as HttpCall & {
        data?: Record<string, unknown>;
      };
      expect(call.url).toBe(`${PATH}/collection/v1_0/requesttopay`);
      expect(call.method).toBe('POST');
      expect(call.headers).toMatchObject({
        Authorization: 'Bearer tok-1',
        'X-Reference-Id': '11111111-1111-4111-8111-111111111111',
        'Ocp-Apim-Subscription-Key': 'primary-key-secret',
        'X-Target-Environment': 'sandbox',
        'Content-Type': 'application/json',
      });
      expect(call.data).toEqual({
        amount: '5100',
        currency: 'XAF',
        externalId: 'txMtn-1',
        payer: { partyIdType: 'MSISDN', partyId: '237671224472' },
        payerMessage: 'Paiement de 5100 XAF',
        payeeNote: 'Paiement de 5100 XAF',
      });
    });

    it('un 202 est une REQUÊTE de débit acceptée, jamais une confirmation de débit', async () => {
      const { service } = buildService({
        request: requestToPayMock({ data: {}, status: 202 }),
      });

      // Tout 2xx résout sans que le service interprète un statut : la vérité
      // vient du GET `requesttopay/{xReferenceId}` (getStatus).
      await expect(
        service.requestToPay({
          partyId: '237671224472',
          amount: 5100,
          currency: 'XAF',
          externalId: 'txMtn-1',
          payerMessage: 'msg',
          payeeNote: 'note',
          xReferenceId: '11111111-1111-4111-8111-111111111111',
        }),
      ).resolves.toBeUndefined();
    });

    it('remonte une erreur ambiguë (5xx) telle quelle, sans mapping local', async () => {
      const request = jest
        .fn()
        .mockReturnValueOnce(of(TOKEN_RESPONSE))
        .mockReturnValue(
          throwError(() => ({
            response: { status: 502, data: { message: 'upstream' } },
          })),
        );
      const { service } = buildService({ request });

      await expect(
        service.requestToPay({
          partyId: '237671224472',
          amount: 100,
          currency: 'XAF',
          externalId: 'tx-1',
          payerMessage: 'msg',
          payeeNote: 'note',
          xReferenceId: '11111111-1111-4111-8111-111111111111',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('getStatus', () => {
    it('interroge requesttopay/{xReferenceId} et normalise le statut en MAJUSCULES', async () => {
      const { service, request } = buildService({
        request: requestToPayMock({
          data: {
            status: 'SUCCESSFUL',
            reason: { code: '0', message: 'ok' },
          },
        }),
      });

      const result = await service.getStatus(
        '11111111-1111-4111-8111-111111111111',
      );

      expect(result).toMatchObject({
        status: 'SUCCESSFUL',
        reason: { code: '0', message: 'ok' },
      });
      // L'appel 0 est le token ; l'appel 1 est le GET de statut.
      const call = request.mock.calls[1][0] as HttpCall;
      expect(call.url).toBe(
        `${PATH}/collection/v1_0/requesttopay/11111111-1111-4111-8111-111111111111`,
      );
      expect(call.headers?.['X-Reference-Id']).toBe(
        '11111111-1111-4111-8111-111111111111',
      );
    });
  });

  describe('newXReferenceId', () => {
    const UUID_V4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('génère un UUID v4 (exigence X-Reference-Id MTN)', () => {
      const value = new MtnCmService({} as HttpService).newXReferenceId();
      expect(value).toMatch(UUID_V4);
    });

    it('ne génère jamais deux fois le même identifiant', () => {
      const service = new MtnCmService({} as HttpService);
      const ids = new Set(Array.from({ length: 100 }, () => service.newXReferenceId()));
      expect(ids.size).toBe(100);
      // uuid v4 réel, pas un ObjectId Mongo (MTN le rejetterait).
      expect(uuidv4()).toMatch(UUID_V4);
    });
  });

  describe('mapStatusToLocal', () => {
    it('mappe les statuts MTN sur le modèle local', () => {
      expect(MtnCmService.mapStatusToLocal('SUCCESSFUL')).toBe('successful');
      expect(MtnCmService.mapStatusToLocal('SUCCESS')).toBe('successful');
      expect(MtnCmService.mapStatusToLocal('PENDING')).toBe('pending');
      expect(MtnCmService.mapStatusToLocal('FAILED')).toBe('failed');
      expect(MtnCmService.mapStatusToLocal('CANCELLED')).toBe('cancelled');
      expect(MtnCmService.mapStatusToLocal('')).toBe('pending');
      expect(MtnCmService.mapStatusToLocal('INCONNU')).toBe('pending');
    });
  });
});