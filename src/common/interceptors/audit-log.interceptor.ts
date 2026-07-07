import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from '../../audit-log/audit-log.service';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const SENSITIVE_FIELDS = new Set([
  'password', 'newPassword', 'currentPassword', 'passwordHash',
  'token', 'accessToken', 'refreshToken', 'idToken',
  'credential', 'apiKey', 'secret',
]);

const SKIP_LOG_PATTERNS: RegExp[] = [
  /\/auth\/logout\b/i,
  /\/auth\/reset-password\b/i,
  /\/auth\/change-password\b/i,
  /\/tracking\/visit\b/i,
];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogs: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const method = req.method as string;

    if (!MUTATING_METHODS.has(method)) return next.handle();
    if (SKIP_LOG_PATTERNS.some((re) => re.test(req.url || ''))) return next.handle();

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: (response) => {
          this.persist(req, response, http.getResponse()?.statusCode, Date.now() - startedAt).catch(() => undefined);
        },
        error: (err) => {
          this.persist(req, null, err?.status || 500, Date.now() - startedAt, err).catch(() => undefined);
        },
      }),
    );
  }

  private async persist(req: any, response: any, statusCode: number, durationMs: number, error?: any) {
    const path: string = this.extractApiPath(req.originalUrl || req.url || '');
    const { action, resourceType, resourceId } = this.parseAction(req.method, path);

    const actor = req.user || {};
    const metadata: Record<string, any> = {};

    const sanitizedBody = this.sanitize(req.body);
    if (sanitizedBody && Object.keys(sanitizedBody).length > 0) metadata.requestBody = sanitizedBody;

    if (response !== null && response !== undefined) {
      const summary = this.summarizeResponse(response);
      if (summary) metadata.responseSummary = summary;
    }

    if (error) {
      metadata.error = {
        name: error?.name,
        message: error?.message,
        status: error?.status,
      };
    }

    await this.auditLogs.record({
      actorId: actor?._id?.toString() || actor?.sub || null,
      actorEmail: actor?.email,
      actorRole: actor?.isAdmin ? 'admin' : actor?.accountType || 'user',
      action,
      resourceType,
      resourceId,
      resourceLabel: this.extractResourceLabel(response),
      metadata: Object.keys(metadata).length ? metadata : undefined,
      method: req.method,
      path,
      statusCode,
      durationMs,
      ip: this.extractIp(req),
      userAgent: req.headers?.['user-agent'],
    });
  }

  private extractApiPath(url: string): string {
    return (url || '').split('?')[0];
  }

  private parseAction(method: string, path: string): { action: string; resourceType?: string; resourceId?: string } {
    const segments = path.replace(/^\//, '').split('/').filter(Boolean);
    if (!segments.length) return { action: `${method.toLowerCase()}.unknown` };

    const resourceType = this.singularize(segments[0]);
    let resourceId: string | undefined;
    let verbSegment: string | undefined;

    if (segments.length >= 3 && this.isLikelyObjectId(segments[1])) {
      resourceId = segments[1];
      verbSegment = segments.slice(2).join('_');
    } else if (segments.length === 2 && this.isLikelyObjectId(segments[1])) {
      resourceId = segments[1];
      verbSegment = undefined;
    } else if (segments.length >= 2 && !this.isLikelyObjectId(segments[1])) {
      verbSegment = segments.slice(1).join('_');
    }

    const verb = this.deriveVerb(method, verbSegment);
    return { action: `${resourceType}.${verb}`, resourceType, resourceId };
  }

  private deriveVerb(method: string, verbSegment?: string): string {
    if (verbSegment) return verbSegment.replace(/-/g, '_');
    if (method === 'POST') return 'create';
    if (method === 'PATCH' || method === 'PUT') return 'update';
    if (method === 'DELETE') return 'delete';
    return method.toLowerCase();
  }

  private singularize(plural: string): string {
    const snake = plural.replace(/-/g, '_').toLowerCase();
    if (snake.endsWith('ies')) return snake.slice(0, -3) + 'y';
    if (snake.endsWith('s') && !snake.endsWith('ss')) return snake.slice(0, -1);
    return snake;
  }

  private isLikelyObjectId(value: string): boolean {
    return /^[a-f0-9]{24}$/i.test(value);
  }

  private sanitize(value: any): any {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((v) => this.sanitize(v));
    if (typeof value !== 'object') return value;

    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_FIELDS.has(key)) {
        out[key] = '[REDACTED]';
      } else if (typeof val === 'object') {
        out[key] = this.sanitize(val);
      } else {
        out[key] = val;
      }
    }
    return out;
  }

  private summarizeResponse(response: any): Record<string, any> | undefined {
    if (response === null || typeof response !== 'object') return undefined;
    const summary: Record<string, any> = {};
    if (response._id) summary._id = String(response._id);
    if (response.id) summary.id = String(response.id);
    if (typeof response.modifiedCount === 'number') summary.modifiedCount = response.modifiedCount;
    if (typeof response.matchedCount === 'number') summary.matchedCount = response.matchedCount;
    if (typeof response.ok === 'boolean') summary.ok = response.ok;
    return Object.keys(summary).length ? summary : undefined;
  }

  private extractResourceLabel(response: any): string | undefined {
    if (response === null || typeof response !== 'object') return undefined;
    return response.name || response.title || response.email || undefined;
  }

  private extractIp(req: any): string | undefined {
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
    return req.ip || req.connection?.remoteAddress || undefined;
  }
}
