import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VisitEvent } from './visit-event.schema';
import { TrackVisitDto } from './dto/track-visit.dto';
import { Request } from 'express';

@Injectable()
export class TrackingService {
  constructor(
    @InjectModel(VisitEvent.name)
    private visitEventModel: Model<VisitEvent>,
  ) {}

  async track(dto: TrackVisitDto, req?: Request): Promise<void> {
    const path = dto.path ? this.normalizePath(dto.path) : '';
    if (!path) return;
    if (this.isExcludedPath(path)) return;

    const ip =
      (req?.headers?.['x-forwarded-for'] as string) || req?.ip || '';
    const userAgent = req?.headers?.['user-agent'] || '';

    if (dto.eventId) {
      await this.visitEventModel.updateOne(
        { eventId: dto.eventId },
        {
          $setOnInsert: {
            eventId: dto.eventId,
            path,
            title: dto.title || '',
            sessionId: dto.sessionId || '',
            ip,
            userAgent,
          },
        },
        { upsert: true },
      );
    } else {
      await this.visitEventModel.create({
        path,
        title: dto.title || '',
        sessionId: dto.sessionId || '',
        ip,
        userAgent,
      });
    }
  }

  async stats(period: string, dateValue: string): Promise<any> {
    const filter = this.filterFor(period, dateValue);
    const { start, end } = filter;

    const totalVisits = await this.visitEventModel.countDocuments();
    const totalVisitors = (
      await this.visitEventModel.distinct('sessionId', { sessionId: { $ne: '' } })
    ).length;

    const periodFilter = { createdAt: { $gte: start, $lte: end } };
    const periodVisits =
      await this.visitEventModel.countDocuments(periodFilter);
    const periodVisitors = (
      await this.visitEventModel.distinct('sessionId', {
        ...periodFilter,
        sessionId: { $ne: '' },
      })
    ).length;

    const rawSeries = await this.aggregateSeries(period, periodFilter);
    const series = this.fillSeries(period, rawSeries, start, end);

    const pages = await this.visitEventModel.aggregate([
      { $match: periodFilter },
      {
        $group: {
          _id: '$path',
          visits: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$sessionId' },
        },
      },
      {
        $project: {
          path: '$_id',
          visits: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' },
        },
      },
      { $sort: { visits: -1 } },
    ]);

    return {
      period,
      selectedDate: dateValue,
      totalVisits,
      periodVisits,
      totalVisitors,
      periodVisitors,
      series,
      pages,
      refreshedAt: new Date().toISOString(),
    };
  }

  private async aggregateSeries(
    period: string,
    match: Record<string, any>,
  ): Promise<any[]> {
    let groupId: any;
    let sortKey = '_id';

    if (period === 'month') {
      groupId = { $dayOfMonth: '$createdAt' };
    } else if (period === 'year') {
      groupId = { $month: '$createdAt' };
    } else {
      groupId = { $hour: '$createdAt' };
    }

    return this.visitEventModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          count: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$sessionId' },
        },
      },
      {
        $project: {
          bucket: '$_id',
          count: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' },
        },
      },
      { $sort: { bucket: 1 } },
    ]);
  }

  private fillSeries(
    period: string,
    rows: any[],
    start: Date,
    end: Date,
  ): any[] {
    const map = new Map<number, { count: number; uniqueVisitors: number }>();
    for (const r of rows) {
      map.set(r.bucket, {
        count: r.count,
        uniqueVisitors: r.uniqueVisitors,
      });
    }

    const result: any[] = [];
    let cursor = new Date(start);

    while (cursor <= end) {
      let bucket: number;
      let label: string;

      if (period === 'month') {
        bucket = cursor.getUTCDate();
        label = String(bucket);
      } else if (period === 'year') {
        bucket = cursor.getUTCMonth() + 1;
        label = cursor.toLocaleDateString('fr-FR', { month: 'short' });
      } else {
        bucket = cursor.getUTCHours();
        label = `${String(bucket).padStart(2, '0')}h`;
      }

      const existing = map.get(bucket);
      result.push({
        bucket,
        label,
        count: existing?.count || 0,
        uniqueVisitors: existing?.uniqueVisitors || 0,
      });

      if (period === 'month') cursor.setUTCDate(cursor.getUTCDate() + 1);
      else if (period === 'year') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCHours(cursor.getUTCHours() + 1);
    }

    return result;
  }

  private filterFor(
    period: string,
    dateValue: string,
  ): { start: Date; end: Date } {
    const now = new Date();
    const d = dateValue ? new Date(dateValue) : now;

    if (period === 'month') {
      const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
      const end = new Date(
        Date.UTC(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
      );
      return { start, end };
    }

    if (period === 'year') {
      const start = new Date(Date.UTC(d.getFullYear(), 0, 1));
      const end = new Date(
        Date.UTC(d.getFullYear(), 11, 31, 23, 59, 59, 999),
      );
      return { start, end };
    }

    const start = new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
    );
    const end = new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
    );
    return { start, end };
  }

  private normalizePath(p: string): string {
    let path = p.split('?')[0];
    path = path.replace(/\/+$/, '');
    if (!path.startsWith('/')) path = '/' + path;
    return path;
  }

  private isExcludedPath(path: string): boolean {
    const excluded = ['/admin', '/manager', '/driver'];
    return excluded.some((prefix) => path.startsWith(prefix));
  }
}
