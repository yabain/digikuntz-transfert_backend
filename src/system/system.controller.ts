/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Body, Controller, Get, Post, Put, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { System } from './system.schema';
import { SystemService } from './system.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

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

  @Get('systemData')
  @ApiOperation({ summary: 'Get system data' })
  @ApiResponse({ status: 200, description: 'List of system data returned.' })
  async getSystemData(): Promise<System[]> {
    return this.systemService.getData();
  }

  @Put('update-data')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateItems(@Body() systemData: any, @Req() req): Promise<any> {
    if(req.user.isAdmin !== true) return 'Unauthorized';
    return this.systemService.updateData(systemData);
  }
}
