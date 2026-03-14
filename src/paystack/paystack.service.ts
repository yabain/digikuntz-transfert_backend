import { HttpService } from '@nestjs/axios';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PaystackService {
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.secretKey =
      this.config.get<string>('PAYSTACK_SECRET_KEY_KES') ??
      this.config.get<string>('PAYSTACK_SECRET_KEY') ??
      '';
  }

  private headers() {
    if (!this.secretKey) {
      throw new HttpException(
        'Missing PAYSTACK_SECRET_KEY_KES',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  private throwHttpFromAxios(error: any, fallbackMessage: string): never {
    const status = Number(error?.response?.status) || HttpStatus.BAD_GATEWAY;
    const details = error?.response?.data || error?.message || error;
    throw new HttpException(
      {
        message: fallbackMessage,
        details,
      },
      status >= 400 && status < 600 ? status : HttpStatus.BAD_GATEWAY,
    );
  }

  private normalizeKesMobileMoneyProvider(input?: string): string {
    const normalized = String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');

    if (!normalized) return 'mpesa';
    if (normalized === 'mpesa') return 'mpesa';
    if (normalized === 'm-pesa') return 'mpesa';
    if (normalized === 'atl' || normalized === 'airtel' || normalized === 'airtelmoney') {
      return 'atl';
    }

    return normalized;
  }

  private buildKesPhoneCandidates(input?: string): string[] {
    const raw = String(input || '').trim();
    const digits = raw.replace(/\D/g, '');
    if (!digits) return [];

    let national = '';
    if (digits.startsWith('254') && digits.length === 12) {
      national = digits.slice(3); // 79xxxxxxx
    } else if (digits.startsWith('0') && digits.length === 10) {
      national = digits.slice(1); // 79xxxxxxx
    } else if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
      national = digits;
    } else {
      national = digits;
    }

    const e164NoPlus = national.length === 9 ? `254${national}` : digits;
    const e164Plus = `+${e164NoPlus}`;
    const localWithZero = national.length === 9 ? `0${national}` : '';
    const localNoZero = national.length === 9 ? national : '';

    return Array.from(
      new Set([e164Plus, e164NoPlus, localWithZero, localNoZero].filter(Boolean)),
    );
  }

  async initializeKesMpesaPayment(payload: {
    email: string;
    amountKobo: number;
    reference: string;
    callbackUrl?: string;
    metadata?: Record<string, any>;
  }) {
    const body: any = {
      email: payload.email,
      amount: payload.amountKobo,
      currency: 'KES',
      reference: payload.reference,
      channels: ['mobile_money'],
      metadata: payload.metadata ?? {},
    };
    if (payload.callbackUrl) body.callback_url = payload.callbackUrl;

    const res = await firstValueFrom(
      this.http.post(`${this.baseUrl}/transaction/initialize`, body, {
        headers: this.headers(),
      }),
    );
    return res.data;
  }

  async chargeKesMobileMoney(payload: {
    email: string;
    amountKobo: number;
    reference: string;
    phone: string;
    provider: string;
    metadata?: Record<string, any>;
  }) {
    const provider = this.normalizeKesMobileMoneyProvider(payload.provider);
    const phoneCandidates = this.buildKesPhoneCandidates(payload.phone);
    if (!phoneCandidates.length) {
      throw new HttpException(
        {
          message: 'Unable to initiate Paystack mobile money request',
          details: {
            status: false,
            message: 'Invalid phone number format',
            code: 'invalid_params',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let lastError: any;
    for (const phone of phoneCandidates) {
      const body: any = {
        email: payload.email,
        amount: payload.amountKobo,
        currency: 'KES',
        reference: payload.reference,
        mobile_money: {
          phone,
          provider,
        },
        metadata: payload.metadata ?? {},
      };

      try {
        const res = await firstValueFrom(
          this.http.post(`${this.baseUrl}/charge`, body, {
            headers: this.headers(),
          }),
        );
        return res.data;
      } catch (error: any) {
        lastError = error;
        const code = String(error?.response?.data?.code || '').toLowerCase();
        const message = String(error?.response?.data?.message || '').toLowerCase();
        const isPhoneFormatError =
          code.includes('invalid_params') &&
          message.includes('phone number format');
        if (!isPhoneFormatError) {
          this.throwHttpFromAxios(
            error,
            'Unable to initiate Paystack mobile money request',
          );
        }
      }
    }

    this.throwHttpFromAxios(
      lastError,
      'Unable to initiate Paystack mobile money request',
    );
  }

  async verifyTransaction(reference: string) {
    const res = await firstValueFrom(
      this.http.get(`${this.baseUrl}/transaction/verify/${reference}`, {
        headers: this.headers(),
      }),
    );
    return res.data;
  }

  private getPagination(query?: any) {
    const page = Number(query?.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = Number(query?.limit);
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 10;
    return { page, limit };
  }

  private sortByCreatedAtDesc<T extends Record<string, any>>(items: T[]): T[] {
    return [...items].sort((a, b) => {
      const ad = new Date(a?.createdAt ?? a?.created_at ?? 0).getTime();
      const bd = new Date(b?.createdAt ?? b?.created_at ?? 0).getTime();
      return bd - ad;
    });
  }

  private sanitizeBankCode(input?: string): string {
    return String(input || '')
      .trim()
      .toUpperCase();
  }

  async resolveKesMpesaBankCode(preferredBankCode?: string): Promise<string> {
    const preferred = this.sanitizeBankCode(preferredBankCode);
    if (preferred) return preferred;

    const tryResolve = async (params: Record<string, any>) => {
      const res = await firstValueFrom(
        this.http.get(`${this.baseUrl}/bank`, {
          headers: this.headers(),
          params,
        }),
      );
      const banks = Array.isArray(res?.data?.data) ? res.data.data : [];
      const mpesa = banks.find((bank: any) => {
        const name = String(bank?.name || '').toLowerCase();
        const slug = String(bank?.slug || '').toLowerCase();
        const code = this.sanitizeBankCode(bank?.code);
        return (
          name.includes('mpesa') ||
          slug.includes('mpesa') ||
          code.includes('MPESA') ||
          code === 'MPS'
        );
      });
      return this.sanitizeBankCode(mpesa?.code);
    };

    try {
      const byCurrency = await tryResolve({ currency: 'KES' });
      if (byCurrency) return byCurrency;
    } catch (_) {}

    try {
      const byCountry = await tryResolve({ country: 'kenya' });
      if (byCountry) return byCountry;
    } catch (_) {}

    return 'MPESA';
  }

  async getBalance() {
    const res = await firstValueFrom(
      this.http.get(`${this.baseUrl}/balance`, {
        headers: this.headers(),
      }),
    );
    return res.data;
  }

  async listPayinTransactions(query?: any) {
    const { page, limit } = this.getPagination(query);
    const params: Record<string, any> = {
      page,
      perPage: limit,
      currency: 'KES',
    };
    if (query?.status) params.status = query.status;
    if (query?.from) params.from = query.from;
    if (query?.to) params.to = query.to;

    const res = await firstValueFrom(
      this.http.get(`${this.baseUrl}/transaction`, {
        headers: this.headers(),
        params,
      }),
    );

    const items = Array.isArray(res?.data?.data) ? res.data.data : [];
    return {
      data: this.sortByCreatedAtDesc(items),
      pagination: {
        page,
        limit,
        totalItems: res?.data?.meta?.total ?? items.length,
        totalPages: res?.data?.meta?.pageCount ?? 1,
      },
      rawMeta: res?.data?.meta ?? null,
    };
  }

  async listPayoutTransactions(query?: any) {
    const { page, limit } = this.getPagination(query);
    const params: Record<string, any> = {
      page,
      perPage: limit,
    };
    if (query?.status) params.status = query.status;
    if (query?.from) params.from = query.from;
    if (query?.to) params.to = query.to;

    const res = await firstValueFrom(
      this.http.get(`${this.baseUrl}/transfer`, {
        headers: this.headers(),
        params,
      }),
    );

    const items = Array.isArray(res?.data?.data) ? res.data.data : [];
    return {
      data: this.sortByCreatedAtDesc(items),
      pagination: {
        page,
        limit,
        totalItems: res?.data?.meta?.total ?? items.length,
        totalPages: res?.data?.meta?.pageCount ?? 1,
      },
      rawMeta: res?.data?.meta ?? null,
    };
  }

  async createKesMpesaTransferRecipient(payload: {
    name: string;
    accountNumber: string;
    bankCode?: string;
    description?: string;
  }) {
    const body: any = {
      type: 'mobile_money',
      name: payload.name,
      account_number: payload.accountNumber,
      bank_code: payload.bankCode || 'MPESA',
      currency: 'KES',
      description: payload.description || 'M-Pesa payout recipient',
    };

    const res = await firstValueFrom(
      this.http.post(`${this.baseUrl}/transferrecipient`, body, {
        headers: this.headers(),
      }),
    );
    return res.data;
  }

  async initiateKesPayout(payload: {
    recipientCode: string;
    amountSmallestUnit: number;
    reference: string;
    reason?: string;
  }) {
    const body: any = {
      source: 'balance',
      amount: payload.amountSmallestUnit,
      recipient: payload.recipientCode,
      reference: payload.reference,
      reason: payload.reason || 'Payout',
    };

    const res = await firstValueFrom(
      this.http.post(`${this.baseUrl}/transfer`, body, {
        headers: this.headers(),
      }),
    );
    return res.data;
  }

  async fetchTransferByReference(reference: string) {
    // Query transfer list by reference to obtain the latest transfer state.
    const res = await firstValueFrom(
      this.http.get(`${this.baseUrl}/transfer`, {
        headers: this.headers(),
        params: { reference },
      }),
    );

    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    return list.find((item: any) => item?.reference === reference) || null;
  }

  async disableTransferOtpWithPin(otp: string) {
    const cleanedOtp = String(otp || '').trim();
    if (!cleanedOtp) {
      throw new HttpException(
        { message: 'OTP/PIN is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Request OTP challenge (Paystack sends code to user) before finalization.
      await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/transfer/disable_otp`,
          {},
          { headers: this.headers() },
        ),
      );
    } catch (error: any) {
      // If challenge already exists, finalize can still succeed. Ignore this step failure.
    }

    try {
      const body = { otp: cleanedOtp };
      const res = await firstValueFrom(
        this.http.post(`${this.baseUrl}/transfer/disable_otp_finalize`, body, {
          headers: this.headers(),
        }),
      );
      return res.data;
    } catch (error: any) {
      this.throwHttpFromAxios(error, 'Unable to disable transfer OTP');
    }
  }
}
