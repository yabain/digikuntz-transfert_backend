import { Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './audit-log.schema';

export interface RecordAuditInput {
  actorId?: string | null;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  resourceLabel?: string;
  metadata?: Record<string, any>;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new AppLogger();

  constructor(
    @InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLogDocument>,
  ) {
    this.logger.setContext(AuditLogService.name);
  }

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.auditLogModel.create({
        actorId: input.actorId || null,
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        resourceLabel: input.resourceLabel,
        metadata: input.metadata,
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        durationMs: input.durationMs,
        ip: input.ip,
        userAgent: input.userAgent,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to persist audit log: ${err?.message || err}`);
    }
  }

  async list(
    page?: number,
    limit?: number,
    filters?: {
      q?: string;
      action?: string;
      actionPrefix?: string;
      resourceType?: string;
      resourceId?: string;
      actorId?: string;
      actorRole?: string;
      statusCode?: string;
      method?: string;
      ip?: string;
      from?: string;
      to?: string;
      sort?: string;
    },
  ) {
    const safePage = Number.isFinite(page) ? Math.max(1, Number(page)) : 1;
    const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Number(limit))) : 20;
    const skip = (safePage - 1) * safeLimit;

    const filter: any = {};

    if (filters?.action) filter.action = filters.action;
    if (filters?.actionPrefix) {
      filter.action = new RegExp(
        `^${filters.actionPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i',
      );
    }
    if (filters?.resourceType) filter.resourceType = filters.resourceType;
    if (filters?.resourceId) filter.resourceId = filters.resourceId;
    if (filters?.actorId) filter.actorId = filters.actorId;
    if (filters?.actorRole) filter.actorRole = filters.actorRole;
    if (filters?.statusCode) filter.statusCode = Number(filters.statusCode);
    if (filters?.method) filter.method = String(filters.method).toUpperCase();
    if (filters?.ip) {
      filter.ip = new RegExp(filters.ip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    if (filters?.q) {
      const qRegex = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { action: qRegex },
        { actorEmail: qRegex },
        { resourceLabel: qRegex },
        { resourceId: qRegex },
        { path: qRegex },
      ];
    }

    if (filters?.from || filters?.to) {
      const createdAt: any = {};
      if (filters.from) {
        const from = new Date(filters.from);
        if (!Number.isNaN(from.getTime())) createdAt.$gte = from;
      }
      if (filters.to) {
        const to = new Date(filters.to);
        if (!Number.isNaN(to.getTime())) createdAt.$lte = to;
      }
      if (Object.keys(createdAt).length) filter.createdAt = createdAt;
    }

    const sortDir = filters?.sort === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: sortDir })
        .skip(skip)
        .limit(safeLimit),
      this.auditLogModel.countDocuments(filter),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;
    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasPrevPage: safePage > 1,
        hasNextPage: totalPages > 0 && safePage < totalPages,
      },
    };
  }

  async distinctActions(prefix?: string, limit = 50): Promise<string[]> {
    const match: any = {};
    if (prefix) {
      match.action = new RegExp(
        `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i',
      );
    }
    const result = await this.auditLogModel.aggregate([
      { $match: match },
      { $group: { _id: '$action' } },
      { $sort: { _id: 1 } },
      { $limit: Math.min(limit, 200) },
    ]);
    return result.map((r) => r._id);
  }

  async distinctResourceTypes(): Promise<string[]> {
    const result = await this.auditLogModel.aggregate([
      { $match: { resourceType: { $exists: true, $ne: '' } } },
      { $group: { _id: '$resourceType' } },
      { $sort: { _id: 1 } },
    ]);
    return result.map((r) => r._id);
  }
}
