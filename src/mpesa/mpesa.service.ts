import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl(): string {
    return (
      this.config.get<string>('MPESA_BASE_URL') ||
      'https://api.safaricom.co.ke'
    );
  }

  private get consumerKey(): string {
    return this.config.get<string>('MPESA_CONSUMER_KEY') || '';
  }

  private get consumerSecret(): string {
    return this.config.get<string>('MPESA_CONSUMER_SECRET') || '';
  }

  private get passKey(): string {
    return this.config.get<string>('MPESA_PASSKEY') || '';
  }

  private get shortCode(): string {
    return this.config.get<string>('MPESA_SHORTCODE') || '';
  }

  private get stkTransactionType():
    | 'CustomerPayBillOnline'
    | 'CustomerBuyGoodsOnline' {
    const raw = String(
      this.config.get<string>('MPESA_STK_TRANSACTION_TYPE') ||
        'CustomerPayBillOnline',
    );
    return raw === 'CustomerBuyGoodsOnline'
      ? 'CustomerBuyGoodsOnline'
      : 'CustomerPayBillOnline';
  }

  private get stkPartyB(): string {
    return this.config.get<string>('MPESA_STK_PARTYB') || this.shortCode;
  }

  private get stkCallbackUrl(): string {
    const explicit = this.config.get<string>('MPESA_STK_CALLBACK_URL') || '';
    if (explicit) return explicit;

    const backendBase =
      this.config.get<string>('BACKEND_URL') ||
      this.config.get<string>('APP_URL') ||
      '';
    if (!backendBase) return '';
    return `${backendBase.replace(/\/$/, '')}/payin/mpesa/callback`;
  }

  private get b2cInitiatorName(): string {
    return this.config.get<string>('MPESA_B2C_INITIATOR_NAME') || '';
  }

  private get b2cSecurityCredential(): string {
    return this.config.get<string>('MPESA_B2C_SECURITY_CREDENTIAL') || '';
  }

  private get b2cResultUrl(): string {
    return this.config.get<string>('MPESA_B2C_RESULT_URL') || '';
  }

  private get b2cTimeoutUrl(): string {
    return this.config.get<string>('MPESA_B2C_TIMEOUT_URL') || '';
  }

  private ensureCoreConfig() {
    if (
      !this.consumerKey ||
      !this.consumerSecret ||
      !this.passKey ||
      !this.shortCode
    ) {
      throw new HttpException(
        {
          message:
            'Missing M-Pesa config. Required: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_SHORTCODE',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private buildTimestamp(date = new Date()): string {
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}${MM}${dd}${hh}${mm}${ss}`;
  }

  private buildPassword(timestamp: string): string {
    return Buffer.from(`${this.shortCode}${this.passKey}${timestamp}`).toString(
      'base64',
    );
  }

  private async getAccessToken(): Promise<string> {
    this.ensureCoreConfig();
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 10_000) {
      return this.cachedToken.value;
    }

    const basicAuth = Buffer.from(
      `${this.consumerKey}:${this.consumerSecret}`,
    ).toString('base64');
    const url = `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;

    const res = await firstValueFrom(
      this.http.get(url, {
        headers: { Authorization: `Basic ${basicAuth}` },
        timeout: 20_000,
      }),
    );
    const token = res?.data?.access_token;
    const expiresIn = Number(res?.data?.expires_in || 3599);
    if (!token) {
      throw new HttpException(
        { message: 'Unable to get M-Pesa access token', details: res?.data },
        HttpStatus.BAD_GATEWAY,
      );
    }
    this.cachedToken = {
      value: token,
      expiresAt: now + expiresIn * 1000,
    };
    return token;
  }

  private async post<T = any>(path: string, body: any): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${path}`;
    try {
      const res = await firstValueFrom(
        this.http.post(url, body, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 25_000,
        }),
      );
      return res.data as T;
    } catch (error: any) {
      const details = error?.response?.data || error?.message || error;
      this.logger.error(`M-Pesa call failed on ${path}`, details);
      throw new HttpException(
        { message: 'M-Pesa request failed', details, path },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async initiateStkPush(payload: {
    phone: string;
    amount: number;
    reference: string;
    description?: string;
    callbackUrl?: string;
  }) {
    const timestamp = this.buildTimestamp();
    const callback = payload.callbackUrl || this.stkCallbackUrl;
    if (!callback) {
      throw new HttpException(
        {
          message:
            'Missing MPESA_STK_CALLBACK_URL (or callbackUrl in payload) for STK push',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const body = {
      BusinessShortCode: this.shortCode,
      Password: this.buildPassword(timestamp),
      Timestamp: timestamp,
      TransactionType: this.stkTransactionType,
      Amount: Math.round(Number(payload.amount)),
      PartyA: payload.phone,
      PartyB: this.stkPartyB,
      PhoneNumber: payload.phone,
      CallBackURL: callback,
      AccountReference: payload.reference,
      TransactionDesc: payload.description || 'Payment',
    };

    return this.post('/mpesa/stkpush/v1/processrequest', body);
  }

  async queryStkStatus(checkoutRequestId: string) {
    const timestamp = this.buildTimestamp();
    const body = {
      BusinessShortCode: this.shortCode,
      Password: this.buildPassword(timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };
    return this.post('/mpesa/stkpushquery/v1/query', body);
  }

  async initiateB2CPayout(payload: {
    phone: string;
    amount: number;
    reference: string;
    remarks?: string;
    occasion?: string;
    commandId?: 'BusinessPayment' | 'SalaryPayment' | 'PromotionPayment';
  }) {
    if (
      !this.b2cInitiatorName ||
      !this.b2cSecurityCredential ||
      !this.b2cResultUrl ||
      !this.b2cTimeoutUrl
    ) {
      throw new HttpException(
        {
          message:
            'Missing B2C config. Required: MPESA_B2C_INITIATOR_NAME, MPESA_B2C_SECURITY_CREDENTIAL, MPESA_B2C_RESULT_URL, MPESA_B2C_TIMEOUT_URL',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const body = {
      InitiatorName: this.b2cInitiatorName,
      SecurityCredential: this.b2cSecurityCredential,
      CommandID: payload.commandId || 'BusinessPayment',
      Amount: Math.round(Number(payload.amount)),
      PartyA: this.shortCode,
      PartyB: payload.phone,
      Remarks: payload.remarks || 'Payout',
      QueueTimeOutURL: this.b2cTimeoutUrl,
      ResultURL: this.b2cResultUrl,
      Occasion: payload.occasion || payload.reference,
    };

    return this.post('/mpesa/b2c/v1/paymentrequest', body);
  }

  mapStkStatusToLocal(
    queryOrCallbackPayload: any,
  ): 'pending' | 'successful' | 'failed' | 'cancelled' {
    const resultCode = Number(
      queryOrCallbackPayload?.ResultCode ??
        queryOrCallbackPayload?.Body?.stkCallback?.ResultCode,
    );
    if (resultCode === 0) return 'successful';
    if (resultCode === 1032) return 'cancelled';
    if ([1, 2001, 1019, 1037, 1025].includes(resultCode)) return 'failed';
    return 'pending';
  }
}
