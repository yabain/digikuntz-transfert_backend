import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditLogService } from './audit-log.service';

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  list(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!req.user?.isAdmin) {
      return this.service.list(Number(page) || 1, Number(limit) || 20, {
        q, action, resourceType,
        actorId: actorId || req.user?._id?.toString(),
        from, to,
      });
    }
    return this.service.list(Number(page) || 1, Number(limit) || 20, {
      q, action, resourceType, actorId, from, to,
    });
  }
}
