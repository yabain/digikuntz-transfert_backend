import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Service natif « Orange Money Cameroun » (Orange CM).
 *
 * S'appuie sur l'API open gateway Orange Cameroon (cf. intégration
 * `ynkap-backend/financial-payment/strategies/orange-money`), adaptée au
 * pattern DigiKuntz (`src/mpesa/mpesa.service.ts` : credentials tolérantes
 * min/maj, `firstValueFrom`, token en cache avec expiration, secrets jamais
 * loggés).
 *
 * Flux : OAuth `token` (Basic user:pass) → `mp/init` (obtention du `payToken`)
 * → `mp/pay` (débit) → `paymentstatus/{token}` (vérification).
 *
 * Toutes les clés sensibles (PIN, mot de passe, X-AUTH-TOKEN) restent en
 * attributs privés et ne sont jamais loggées.
 */
@Injectable()
export class OrangeCmService {
  private readonly logger = new Logger(OrangeCmService.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  private _path = '';
  private _username = '';
  private _password = '';
  private _xAuthToken = '';
  private _channelUserMsisdn = '';
  private _pin = '';
  private _merchantKey = '';

  constructor(private readonly http: HttpService) {}

  /** Les variantes minuscules et MAJUSCULES sont acceptées (pattern Mpesa). */
  setCredentials(creds: Record<string, any>): void {
    const pick = (lower: string, upper: string) =>
      creds[lower] ?? creds[upper] ?? undefined;
    const set = (v: any, target: (value: string) => void) => {
      if (typeof v === 'string' && v.trim()) target(v.trim());
    };
    set(pick('path', 'OM_API_PATH'), (v) => (this._path = v));
    set(pick('username', 'OM_API_USERNAME'), (v) => (this._username = v));
    set(pick('password', 'OM_API_PASSWORD'), (v) => (this._password = v));
    set(pick('xAuthToken', 'OM_API_X_AUTH_TOKEN'), (v) => (this._xAuthToken = v));
    set(pick('channelUserMsisdn', 'OM_API_CHANNELUSERMSISDN'), (v) => (this._channelUserMsisdn = v));
    set(pick('pin', 'OM_API_PIN'), (v) => (this._pin = v));
    set(pick('merchantKey', 'OM_API_MERCHANT_KEY'), (v) => (this._merchantKey = v));
  }

  private ensureCoreConfig(): void {
    if (
      !this._path ||
      !this._username ||
      !this._password ||
      !this._xAuthToken ||
      !this._channelUserMsisdn ||
      !this._pin
    ) {
      throw new HttpException(
        {
          message:
            'Missing Orange CM config. Required: OM_API_PATH, OM_API_USERNAME, OM_API_PASSWORD, OM_API_X_AUTH_TOKEN, OM_API_CHANNELUSERMSISDN, OM_API_PIN',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Token OAuth2 `client_credentials`, mis en cache jusqu'à expiration. */
  async getAccessToken(): Promise<string> {
    this.ensureCoreConfig();
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 10_000) {
      return this.cachedToken.value;
    }

    const basicAuth = Buffer.from(
      `${this._username}:${this._password}`,
    ).toString('base64');
    const url = `${this._path}/token`;

    let res;
    try {
      res = await firstValueFrom(
        this.http.request({
          url,
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          data: 'grant_type=client_credentials',
          timeout: 20_000,
        }),
      );
    } catch (error: any) {
      this.logger.error(
        'Orange CM token request failed',
        error?.response?.data || error?.message || error,
      );
      throw new HttpException(
        { message: 'Orange CM token request failed' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const token = res?.data?.access_token;
    const expiresIn = Number(res?.data?.expires_in || 3599);
    if (!token) {
      throw new HttpException(
        { message: 'Unable to get Orange CM access token', details: res?.data },
        HttpStatus.BAD_GATEWAY,
      );
    }
    this.cachedToken = { value: token, expiresAt: now + expiresIn * 1000 };
    return token;
  }

  private omHeaders(auth: string): Record<string, string> {
    return {
      Authorization: `Bearer ${auth}`,
      'X-AUTH-TOKEN': this._xAuthToken,
      'Content-Type': 'application/json',
    };
  }

  /** `mp/init` → fournit le `payToken` de la session de paiement. */
  async initPay(auth: string): Promise<{ payToken: string }> {
    try {
      const res = await firstValueFrom(
        this.http.request({
          url: `${this._path}/omcoreapis/1.0.2/mp/init`,
          method: 'POST',
          headers: this.omHeaders(auth),
          timeout: 20_000,
        }),
      );
      const payToken = res?.data?.data?.payToken;
      if (!payToken) {
        throw new HttpException(
          { message: 'Orange CM mp/init did not return a payToken' },
          HttpStatus.BAD_GATEWAY,
        );
      }
      return { payToken };
    } catch (error: any) {
      this.logger.error(
        'Orange CM mp/init failed',
        error?.response?.data || error?.message || error,
      );
      throw new HttpException(
        { message: 'Orange CM payment failed to initialize' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * `mp/pay` — déclenche le push de débit vers `subscriberMsisdn`.
   * Une réponse 2xx signifie que la requête de débit est partie (le statut
   * réel s'obtient via `getStatus`), PAS que le paiement est confirmé.
   */
  async pay(input: {
    payToken: string;
    subscriberMsisdn: string;
    amount: number;
    orderId: string;
    description: string;
    notifUrl: string;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.http.request({
          url: `${this._path}/omcoreapis/1.0.2/mp/pay`,
          method: 'POST',
          headers: this.omHeaders(await this.getAccessToken()),
          data: {
            notifUrl: input.notifUrl,
            channelUserMsisdn: this._channelUserMsisdn,
            amount: String(input.amount),
            subscriberMsisdn: input.subscriberMsisdn,
            pin: this._pin,
            orderId: input.orderId,
            description: input.description,
            payToken: input.payToken,
          },
          timeout: 25_000,
        }),
      );
    } catch (error: any) {
      const data = error?.response?.data;
      // Erreur métier retournée par Orange (ex. fonds insuffisants) → 400.
      if (
        data &&
        typeof data === 'object' &&
        String(data?.data?.status || '').toUpperCase() === 'FAILED'
      ) {
        throw new HttpException(
          {
            message:
              String(data?.data?.message || 'Orange CM payment failed').slice(0, 300),
            details: data,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      this.logger.error(
        'Orange CM mp/pay failed',
        data || error?.message || error,
      );
      // 5xx/timeout : ambigu (le débit a pu partir) — propager tel quel.
      throw new HttpException(
        { message: 'Orange CM payment request failed', details: data },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Statut réel d'un paiement Orange via `paymentstatus/{token}`. */
  async getStatus(payToken: string): Promise<{
    status: string;
    reason?: { code?: string; message?: string };
    data?: any;
  }> {
    try {
      const res = await firstValueFrom(
        this.http.request({
          url: `${this._path}/omcoreapis/1.0.2/mp/paymentstatus/${encodeURIComponent(payToken)}`,
          method: 'GET',
          headers: this.omHeaders(await this.getAccessToken()),
          timeout: 20_000,
        }),
      );
      // Parsing tolérant : {data:{data:…}} | {data:…} | plat.
      const payload = res?.data ?? {};
      const inner = payload?.data ?? payload;
      return {
        status: String(inner?.status || payload?.status || '').toUpperCase(),
        reason: inner?.reason ?? payload?.reason ?? undefined,
        data: inner ?? payload,
      };
    } catch (error: any) {
      this.logger.error(
        'Orange CM paymentstatus failed',
        error?.response?.data || error?.message || error,
      );
      throw new HttpException(
        { message: 'Unable to query Orange CM payment status' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Mapping des statuts natifs Orange vers le modèle local. */
  static mapStatusToLocal(
    status: string,
  ): 'pending' | 'successful' | 'failed' | 'cancelled' {
    const s = String(status || '').toUpperCase();
    if (s === 'SUCCESSFULL' || s === 'SUCCESS' || s === 'SUCCESSFUL') {
      return 'successful';
    }
    if (s === 'FAILED') return 'failed';
    if (s === 'CANCELLED' || s === 'CANCELED' || s === 'EXPIRED') {
      return 'cancelled';
    }
    return 'pending';
  }
}