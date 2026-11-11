import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service natif « MTN MoMo Cameroun » (MTN CM).
 *
 * S'appuie sur l'API MTN Open API collection (cf. intégration
 * `ynkap-backend/financial-payment/strategies/mtn-money`), adaptée au pattern
 * DigiKuntz (`src/mpesa/mpesa.service.ts` : credentials tolérantes min/maj,
 * `firstValueFrom`, token en cache, secrets jamais loggés).
 *
 * Flux : token (Basic `{defaultUuid}:{apiKey}` + `Ocp-Apim-Subscription-Key`)
 * → `POST /collection/v1_0/requesttopay` (202 = requête de débit acceptée,
 * PAS un débit confirmé) → `GET .../requesttopay/{xReferenceId}` (statut réel).
 *
 * Un `X-Reference-Id` UUID v4 EST GÉNÉRÉ PAR PAYIN (jamais réutilisé) :
 * l'ObjectId Mongo de ynkap n'est pas un UUID v4 et MTN le rejetterait ou
 * provoquerait des collisions.
 */
@Injectable()
export class MtnCmService {
  private readonly logger = new Logger(MtnCmService.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  private _path = '';
  private _apiKey = '';
  private _primaryKey = '';
  private _secondaryKey = '';
  private _defaultUuid = '';
  private _modeEnv = 'sandbox';

  constructor(private readonly http: HttpService) {}

  setCredentials(creds: Record<string, any>): void {
    const pick = (lower: string, upper: string) =>
      creds[lower] ?? creds[upper] ?? undefined;
    const set = (v: any, target: (value: string) => void) => {
      if (typeof v === 'string' && v.trim()) target(v.trim());
    };
    set(pick('path', 'MOMO_API_PATH'), (v) => (this._path = v));
    set(pick('apiKey', 'MOMO_API_KEY'), (v) => (this._apiKey = v));
    set(pick('primaryKey', 'MOMO_API_PRIMARY_KEY'), (v) => (this._primaryKey = v));
    set(pick('secondaryKey', 'MOMO_API_SECONDARY_KEY'), (v) => (this._secondaryKey = v));
    set(pick('defaultUuid', 'MOMO_API_DEFAULT_UUID'), (v) => (this._defaultUuid = v));
    const mode = pick('modeEnv', 'MOMO_API_MODE_ENV');
    if (typeof mode === 'string' && mode.trim()) this._modeEnv = mode.trim();
  }

  private ensureCoreConfig(): void {
    if (
      !this._path ||
      !this._apiKey ||
      !this._primaryKey ||
      !this._defaultUuid
    ) {
      throw new HttpException(
        {
          message:
            'Missing MTN CM config. Required: MOMO_API_PATH, MOMO_API_KEY, MOMO_API_PRIMARY_KEY, MOMO_API_DEFAULT_UUID',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Token API MTN collection, mis en cache jusqu'à expiration. */
  async getAccessToken(): Promise<string> {
    this.ensureCoreConfig();
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 10_000) {
      return this.cachedToken.value;
    }

    const basicAuth = Buffer.from(
      `${this._defaultUuid}:${this._apiKey}`,
    ).toString('base64');
    const url = `${this._path}/collection/token/`;

    let res;
    try {
      res = await firstValueFrom(
        this.http.request({
          url,
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Ocp-Apim-Subscription-Key': this._primaryKey,
          },
          timeout: 20_000,
        }),
      );
    } catch (error: any) {
      this.logger.error(
        'MTN CM token request failed',
        error?.response?.data || error?.message || error,
      );
      throw new HttpException(
        { message: 'MTN CM token request failed' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const token = res?.data?.access_token;
    const expiresIn = Number(res?.data?.expires_in || 3599);
    if (!token) {
      throw new HttpException(
        { message: 'Unable to get MTN CM access token', details: res?.data },
        HttpStatus.BAD_GATEWAY,
      );
    }
    this.cachedToken = { value: token, expiresAt: now + expiresIn * 1000 };
    return token;
  }

  /**
   * `requesttopay` — soumet la requête de débit. HTTP 202 = acceptée (le statut
   * réel est lu via `getStatus`), jamais une confirmation de débit.
   */
  async requestToPay(input: {
    partyId: string;
    amount: number;
    currency: string;
    externalId: string;
    payerMessage: string;
    payeeNote: string;
    xReferenceId: string;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.http.request({
          url: `${this._path}/collection/v1_0/requesttopay`,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await this.getAccessToken()}`,
            'X-Reference-Id': input.xReferenceId,
            'Ocp-Apim-Subscription-Key': this._primaryKey,
            'X-Target-Environment': this._modeEnv,
            'Content-Type': 'application/json',
          },
          data: {
            amount: String(input.amount),
            currency: input.currency,
            externalId: input.externalId,
            payer: { partyIdType: 'MSISDN', partyId: input.partyId },
            payerMessage: input.payerMessage,
            payeeNote: input.payeeNote,
          },
          timeout: 25_000,
        }),
      );
    } catch (error: any) {
      const data = error?.response?.data;
      this.logger.error(
        'MTN CM requesttopay failed',
        data || error?.message || error,
      );
      // 5xx/timeout : ambigu (le débit a pu partir) → propager tel quel.
      throw new HttpException(
        { message: 'MTN CM payment request failed', details: data },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Statut réel d'une requête de paiement MTN via `requesttopay/{xRefId}`. */
  async getStatus(xReferenceId: string): Promise<{
    status: string;
    reason?: { code?: string; message?: string };
    data?: any;
  }> {
    try {
      const res = await firstValueFrom(
        this.http.request({
          url: `${this._path}/collection/v1_0/requesttopay/${encodeURIComponent(xReferenceId)}`,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${await this.getAccessToken()}`,
            'X-Reference-Id': xReferenceId,
            'Ocp-Apim-Subscription-Key': this._primaryKey,
            'X-Target-Environment': this._modeEnv,
          },
          timeout: 20_000,
        }),
      );
      const payload = res?.data ?? {};
      return {
        status: String(payload?.status || '').toUpperCase(),
        reason: payload?.reason ?? undefined,
        data: payload,
      };
    } catch (error: any) {
      this.logger.error(
        'MTN CM requesttopay status failed',
        error?.response?.data || error?.message || error,
      );
      throw new HttpException(
        { message: 'Unable to query MTN CM payment status' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Solde du wallet marchand MTN MoMo (Collection), endpoint officiel
   * `GET /collection/v1_0/account/balance`. Réponse typique :
   * `{ AvailableBalance, Balance, Currency }`. Aucun secret loggé.
   */
  async getAccountBalance(): Promise<{
    availableBalance: number;
    balance: number;
    currency: string;
    raw?: any;
  }> {
    try {
      const res = await firstValueFrom(
        this.http.request({
          url: `${this._path}/collection/v1_0/account/balance`,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${await this.getAccessToken()}`,
            'Ocp-Apim-Subscription-Key': this._primaryKey,
            'X-Target-Environment': this._modeEnv,
          },
          timeout: 20_000,
        }),
      );
      const payload = res?.data ?? {};
      this.logger.log(
        `MTN CM balance fetched (currency=${payload?.Currency || 'n/a'})`,
      );
      return {
        availableBalance: Number(payload?.AvailableBalance ?? 0),
        balance: Number(payload?.Balance ?? 0),
        currency: String(payload?.Currency || 'XAF').toUpperCase(),
        raw: payload,
      };
    } catch (error: any) {
      this.logger.error(
        'MTN CM account/balance failed',
        error?.response?.data || error?.message || error,
      );
      throw new HttpException(
        { message: 'Unable to query MTN CM account balance' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Nouvel UUID v4 pour `X-Reference-Id` (idempotence MTN par payin). */
  newXReferenceId(): string {
    return uuidv4();
  }

  /** Mapping des statuts MTN vers le modèle local. */
  static mapStatusToLocal(
    status: string,
  ): 'pending' | 'successful' | 'failed' | 'cancelled' {
    const s = String(status || '').toUpperCase();
    if (s === 'SUCCESSFUL' || s === 'SUCCESS') return 'successful';
    if (s === 'FAILED') return 'failed';
    if (s === 'CANCELLED') return 'cancelled';
    return 'pending';
  }
}