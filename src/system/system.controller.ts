/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Controller, Get, Post } from '@nestjs/common';
import { System } from './system.schema';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private systemService: SystemService) {}

  @Get()
  async getData(): Promise<System[]> {
    return this.systemService.getData();
  }

  @Post('import')
  async import(): Promise<any> {
    return this.systemService.import();
  }
}
