import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TraceService } from './trace.service';
import * as crypto from 'crypto';

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  constructor(private readonly traceService: TraceService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const traceId = (req.headers['x-trace-id'] as string) || crypto.randomUUID();
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string;
    req.headers['x-trace-id'] = traceId;
    res.setHeader('x-trace-id', traceId);
    this.traceService.run({ traceId, ip, userAgent }, () => next());
  }
}
