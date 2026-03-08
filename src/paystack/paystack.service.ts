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
}
