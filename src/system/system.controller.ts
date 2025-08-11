/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Controller, Get, Post } from '@nestjs/common';
import { System } from './system.schema';
import { SystemService } from './system.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private systemService: SystemService) {}

  @Get()
  @ApiOperation({ summary: 'Get all system data' })
  @ApiResponse({ status: 200, description: 'List of system data returned.' })
  async getData(): Promise<System[]> {
    return this.systemService.getData();
  }

  @Post('import')
  @ApiOperation({ summary: 'Import system data (dev only)' })
  @ApiResponse({ status: 201, description: 'System data imported.' })
  async import(): Promise<any> {
    return this.systemService.import();
  }
}
