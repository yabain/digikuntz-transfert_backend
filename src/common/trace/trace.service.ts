import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  traceId: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TraceService {
  private readonly als = new AsyncLocalStorage<TraceContext>();

  run(context: TraceContext, fn: () => void): void {
    this.als.run(context, fn);
  }

  getTraceId(): string | undefined {
    return this.als.getStore()?.traceId;
  }

  getIp(): string | undefined {
    return this.als.getStore()?.ip;
  }

  getUserAgent(): string | undefined {
    return this.als.getStore()?.userAgent;
  }
}
