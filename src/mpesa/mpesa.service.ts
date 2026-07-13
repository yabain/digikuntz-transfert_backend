import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  private _consumerKey = '';
  private _consumerSecret = '';
  private _passKey = '';
  private _shortCode = '';
  private _baseUrl = 'https://api.safaricom.co.ke';
  private _stkTransactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline' = 'CustomerPayBillOnline';
  private _stkPartyB = '';
  private _stkCallbackUrl = '';
  private _b2cInitiatorName = '';
  private _b2cSecurityCredential = '';
  private _b2cResultUrl = '';
  private _b2cTimeoutUrl = '';
  private _balanceResultUrl = '';
  private _balanceTimeoutUrl = '';

  constructor(
    private readonly http: HttpService,
  ) {}

  setCredentials(creds: Record<string, any>): void {
    if (creds.consumerKey) this._consumerKey = creds.consumerKey;
    if (creds.MPESA_CONSUMER_KEY) this._consumerKey = creds.MPESA_CONSUMER_KEY;
    if (creds.consumerSecret) this._consumerSecret = creds.consumerSecret;
    if (creds.MPESA_CONSUMER_SECRET) this._consumerSecret = creds.MPESA_CONSUMER_SECRET;
    if (creds.passKey) this._passKey = creds.passKey;
    if (creds.MPESA_PASSKEY) this._passKey = creds.MPESA_PASSKEY;
    if (creds.shortCode) this._shortCode = creds.shortCode;
    if (creds.MPESA_SHORTCODE) this._shortCode = creds.MPESA_SHORTCODE;
    if (creds.baseUrl) this._baseUrl = creds.baseUrl;
    if (creds.MPESA_BASE_URL) this._baseUrl = creds.MPESA_BASE_URL;
    if (creds.MPESA_STK_TRANSACTION_TYPE === 'CustomerBuyGoodsOnline') this._stkTransactionType = 'CustomerBuyGoodsOnline';
    if (creds.stkPartyB) this._stkPartyB = creds.stkPartyB;
    if (creds.MPESA_STK_PARTYB) this._stkPartyB = creds.MPESA_STK_PARTYB;
    if (creds.stkCallbackUrl) this._stkCallbackUrl = creds.stkCallbackUrl;
    if (creds.MPESA_STK_CALLBACK_URL) this._stkCallbackUrl = creds.MPESA_STK_CALLBACK_URL;
    if (creds.b2cInitiatorName) this._b2cInitiatorName = creds.b2cInitiatorName;
    if (creds.MPESA_B2C_INITIATOR_NAME) this._b2cInitiatorName = creds.MPESA_B2C_INITIATOR_NAME;
    if (creds.b2cSecurityCredential) this._b2cSecurityCredential = creds.b2cSecurityCredential;
    if (creds.MPESA_B2C_SECURITY_CREDENTIAL) this._b2cSecurityCredential = creds.MPESA_B2C_SECURITY_CREDENTIAL;
    if (creds.b2cResultUrl) this._b2cResultUrl = creds.b2cResultUrl;
    if (creds.MPESA_B2C_RESULT_URL) this._b2cResultUrl = creds.MPESA_B2C_RESULT_URL;
    if (creds.b2cTimeoutUrl) this._b2cTimeoutUrl = creds.b2cTimeoutUrl;
    if (creds.MPESA_B2C_TIMEOUT_URL) this._b2cTimeoutUrl = creds.MPESA_B2C_TIMEOUT_URL;
    if (creds.balanceResultUrl) this._balanceResultUrl = creds.balanceResultUrl;
    if (creds.MPESA_BALANCE_RESULT_URL) this._balanceResultUrl = creds.MPESA_BALANCE_RESULT_URL;
    if (creds.balanceTimeoutUrl) this._balanceTimeoutUrl = creds.balanceTimeoutUrl;
    if (creds.MPESA_BALANCE_TIMEOUT_URL) this._balanceTimeoutUrl = creds.MPESA_BALANCE_TIMEOUT_URL;
  }

  private get baseUrl(): string {
    return this._baseUrl;
  }

  private get consumerKey(): string {
    return this._consumerKey;
  }

  private get consumerSecret(): string {
    return this._consumerSecret;
  }

  private get passKey(): string {
    return this._passKey;
  }

  private get shortCode(): string {
    return this._shortCode;
  }

  private get stkTransactionType():
    | 'CustomerPayBillOnline'
    | 'CustomerBuyGoodsOnline' {
    return this._stkTransactionType;
  }

  private get stkPartyB(): string {
    return this._stkPartyB || this._shortCode;
  }

  private get stkCallbackUrl(): string {
    return this._stkCallbackUrl;
  }

  private get b2cInitiatorName(): string {
    return this._b2cInitiatorName;
  }

  private get b2cSecurityCredential(): string {
    return this._b2cSecurityCredential;
  }

  private get b2cResultUrl(): string {
    return this._b2cResultUrl;
  }

  private get b2cTimeoutUrl(): string {
    return this._b2cTimeoutUrl;
  }

  private get balanceResultUrl(): string {
    return this._balanceResultUrl || this._b2cResultUrl;
  }

  private get balanceTimeoutUrl(): string {
    return this._balanceTimeoutUrl || this._b2cTimeoutUrl;
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

  private formatAccountReference(reference: string): string {
    const normalized = String(reference || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!normalized) return 'DIGIKUNTZ';
    return normalized.slice(0, 12);
  }

  private formatTransactionDesc(desc?: string): string {
    const normalized = String(desc || 'Payment')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return 'Payment';
    return normalized.slice(0, 13);
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
      console.log('res balance: ', res)
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
      AccountReference: this.formatAccountReference(payload.reference),
      TransactionDesc: this.formatTransactionDesc(payload.description),
    };

    console.log('STK push request body:', JSON.stringify(body, null, 2));

    this.logger.log(
      `STK push request: phone=${payload.phone}, amount=${Math.round(
        Number(payload.amount),
      )}, type=${this.stkTransactionType}, partyB=${this.stkPartyB}, callback=${callback}`,
    );
    const response = await this.post('/mpesa/stkpush/v1/processrequest', body);
    this.logger.log(
      `STK push accepted: checkoutRequestId=${response?.CheckoutRequestID || response?.data?.CheckoutRequestID || ''}, responseCode=${response?.ResponseCode || response?.data?.ResponseCode || ''}`,
    );
    return response;
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

  async queryAccountBalance(payload?: {
    remarks?: string;
    resultUrl?: string;
    timeoutUrl?: string;
    identifierType?: '1' | '2' | '4';
  }) {
    if (!this.b2cInitiatorName || !this.b2cSecurityCredential) {
      throw new HttpException(
        {
          message:
            'Missing balance query config. Required: MPESA_B2C_INITIATOR_NAME, MPESA_B2C_SECURITY_CREDENTIAL',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const resultUrl = payload?.resultUrl || this.balanceResultUrl;
    const timeoutUrl = payload?.timeoutUrl || this.balanceTimeoutUrl;
    if (!resultUrl || !timeoutUrl) {
      throw new HttpException(
        {
          message:
            'Missing balance callback URLs. Set MPESA_BALANCE_RESULT_URL and MPESA_BALANCE_TIMEOUT_URL (or MPESA_B2C_RESULT_URL and MPESA_B2C_TIMEOUT_URL)',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const body = {
      Initiator: this.b2cInitiatorName,
      SecurityCredential: this.b2cSecurityCredential,
      CommandID: 'AccountBalance',
      PartyA: this.shortCode,
      IdentifierType: payload?.identifierType || '4',
      Remarks: payload?.remarks || 'Balance query',
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
    };

    return this.post('/mpesa/accountbalance/v1/query', body);
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
    if (Number.isFinite(resultCode) && resultCode > 0) return 'failed';
    return 'pending';
  }
}
