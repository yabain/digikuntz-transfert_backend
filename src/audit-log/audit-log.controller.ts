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
    @Query('actionPrefix') actionPrefix?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('actorId') actorId?: string,
    @Query('actorRole') actorRole?: string,
    @Query('statusCode') statusCode?: string,
    @Query('method') method?: string,
    @Query('ip') ip?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sort') sort?: string,
  ) {
    if (!req.user?.isAdmin) {
      return this.service.list(Number(page) || 1, Number(limit) || 20, {
        q, action, actionPrefix, resourceType, resourceId,
        actorId: actorId || req.user?._id?.toString(),
        actorRole, statusCode, method, ip, from, to, sort,
      });
    }
    return this.service.list(Number(page) || 1, Number(limit) || 20, {
      q, action, actionPrefix, resourceType, resourceId, actorId,
      actorRole, statusCode, method, ip, from, to, sort,
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('actions')
  async actions(
    @Req() req: any,
    @Query('prefix') prefix?: string,
  ) {
    if (!req.user?.isAdmin) {
      return { data: await this.service.distinctActions(prefix, 50) };
    }
    return { data: await this.service.distinctActions(prefix, 100) };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('resource-types')
  async resourceTypes(@Req() req: any) {
    if (!req.user?.isAdmin) {
      return { data: [] };
    }
    return { data: await this.service.distinctResourceTypes() };
  }
}
