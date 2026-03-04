import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Response } from 'express';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health/home endpoint' })
  @ApiResponse({ status: 200, description: 'Backend welcome response.' })
  getHello(@Res() res: Response): string {
    return this.appService.getHello(res);
  }
}
