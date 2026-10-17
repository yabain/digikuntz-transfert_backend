/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GatewayLoaderService } from 'src/payment/gateway-loader.service';
import { sanitizeFlutterwaveError } from './flutterwave-error.util';

/**
 * Low-level HTTP client for the Flutterwave API.
 *
 * This is the ONLY place allowed to know about Flutterwave base URLs,
 * authentication headers and upstream error mapping. Business services
 * (payout, transaction, ...) must go through it instead of calling
 * `api.flutterwave.com` directly, so that this plumbing exists once.
 *
 * Credentials are resolved per call from the gateway configuration of the
 * requested currency (GatewayLoaderService), never from shared mutable state,
 * so concurrent calls for different currencies cannot corrupt each other.
 */
@Injectable()
export class FlutterwaveApiService {
  private readonly logger = new Logger(FlutterwaveApiService.name);

  private readonly baseUrlV3 = 'https://api.flutterwave.com/v3';

  constructor(
    private readonly http: HttpService,
    private readonly gatewayLoader: GatewayLoaderService,
  ) {}

  // ---------- Credentials ----------

  /**
   * Flutterwave secret key configured for a currency.
   * @param {string} [currency] - Currency of the gateway to read (default XAF).
   * @returns {Promise<string>} - Secret key, or '' when the gateway has none.
   * @throws {NotFoundException} - When no gateway is configured for the currency.
   */
  async getSecretKey(currency = 'XAF'): Promise<string> {
    const config = await this.gatewayLoader.getConfig(currency);
    return (
      config?.credentials?.FLUTTERWAVE_SECRET_KEY ||
      config?.credentials?.secretKey ||
      ''
    );
  }

  /**
   * Non-throwing variant of getSecretKey.
   * @param {string} [currency] - Currency of the gateway to read (default XAF).
   * @returns {Promise<boolean>} - True when a secret key is available.
   */
  async hasCredentials(currency = 'XAF'): Promise<boolean> {
    try {
      return Boolean(await this.getSecretKey(currency));
    } catch (err: any) {
      this.logger.warn(
        `Could not load Flutterwave credentials for ${currency}: ${err?.message ?? err}`,
      );
      return false;
    }
  }

  /**
   * Fails fast when the currency has no usable Flutterwave credentials.
   * @param {string} [currency] - Currency of the gateway to read (default XAF).
   * @returns {Promise<void>}
   * @throws {NotFoundException} - When no secret key is available.
   */
  async assertCredentials(currency = 'XAF'): Promise<void> {
    if (!(await this.hasCredentials(currency))) {
      throw new NotFoundException(
        'No Flutterwave gateway credentials found in database',
      );
    }
  }

  // ---------- Transport ----------

  private async authHeader(currency?: string): Promise<Record<string, string>> {
    const secret = await this.getSecretKey(currency);
    if (!secret) {
      throw new NotFoundException(
        'No Flutterwave gateway credentials found in database',
      );
    }
    return { Authorization: `Bearer ${secret}` };
  }

  private async request<T = any>(config: {
    method: 'get' | 'post';
    path: string;
    currency?: string;
    params?: Record<string, any>;
    data?: any;
    fallbackMessage: string;
  }): Promise<T> {
    // Credential resolution happens outside the try block on purpose: a missing
    // gateway must surface as-is, not be rewritten into a generic upstream error.
    const headers = await this.authHeader(config.currency);
    try {
      const res = await firstValueFrom(
        this.http.request({
          method: config.method,
          url: `${this.baseUrlV3}${config.path}`,
          headers,
          params: config.params,
          data: config.data,
        }),
      );
      return res.data as T;
    } catch (error: any) {
      const parsed = sanitizeFlutterwaveError(
        error,
        config.fallbackMessage,
        this.logger,
      );
      throw new HttpException(parsed.payload, parsed.statusCode);
    }
  }

  // ---------- Transfers (payouts) ----------

  /**
   * GET /v3/transfers/{id} — raw transfer resource.
   * @param {string|number} transferId - Flutterwave numeric transfer id.
   * @param {string} [currency] - Currency used to resolve credentials.
   * @returns {Promise<any>} - The transfer object returned by Flutterwave.
   */
  async getTransferById(
    transferId: string | number,
    currency?: string,
  ): Promise<any> {
    const body = await this.request({
      method: 'get',
      path: `/transfers/${transferId}`,
      currency,
      fallbackMessage: 'Flutterwave transfer lookup failed',
    });
    return body?.data;
  }

  /**
   * GET /v3/transfers?reference=... — normalises the list response to a single
   * transfer (Flutterwave returns an array for this endpoint).
   * @param {string} reference - Payout reference.
   * @param {string} [currency] - Currency used to resolve credentials.
   * @returns {Promise<any|null>} - The transfer, or null when none matches.
   */
  async getTransferByReference(
    reference: string,
    currency?: string,
  ): Promise<any> {
    const body = await this.request({
      method: 'get',
      path: '/transfers',
      currency,
      params: { reference },
      fallbackMessage: 'Flutterwave transfer lookup failed',
    });
    const data = body?.data;
    if (Array.isArray(data)) return data.length > 0 ? data[0] : null;
    return data ?? null;
  }

  /**
   * POST /v3/transfers — initiates a payout.
   * @param {any} payload - Flutterwave transfer payload.
   * @param {string} [currency] - Currency used to resolve credentials.
   * @returns {Promise<any>} - The full Flutterwave response envelope.
   */
  async createTransfer(payload: any, currency?: string): Promise<any> {
    return this.request({
      method: 'post',
      path: '/transfers',
      currency,
      data: payload,
      fallbackMessage: 'Flutterwave transfer creation failed',
    });
  }

  // ---------- Transactions (pay-ins) ----------

  /**
   * GET /v3/transactions/{id}/verify — raw transaction resource.
   * @param {string|number} flwTxId - Flutterwave numeric transaction id.
   * @param {string} [currency] - Currency used to resolve credentials.
   * @returns {Promise<any>} - The transaction object returned by Flutterwave.
   */
  async verifyPayinById(
    flwTxId: string | number,
    currency?: string,
  ): Promise<any> {
    const body = await this.request({
      method: 'get',
      path: `/transactions/${flwTxId}/verify`,
      currency,
      fallbackMessage: 'Flutterwave pay-in verification failed',
    });
    return body?.data;
  }

  /**
   * GET /v3/transactions/verify_by_reference — raw transaction resource.
   * @param {string} txRef - Flutterwave transaction reference.
   * @param {string} [currency] - Currency used to resolve credentials.
   * @returns {Promise<any>} - The transaction object returned by Flutterwave.
   */
  async verifyPayinByReference(txRef: string, currency?: string): Promise<any> {
    const body = await this.request({
      method: 'get',
      path: '/transactions/verify_by_reference',
      currency,
      params: { tx_ref: txRef },
      fallbackMessage: 'Flutterwave pay-in verification failed',
    });
    return body?.data;
  }
}
