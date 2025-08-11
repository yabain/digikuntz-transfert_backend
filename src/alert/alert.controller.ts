/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AlertService } from './alert.service';
import { AuthGuard } from '@nestjs/passport';
import { Query as ExpressQuery } from 'express-serve-static-core';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('alert')
@Controller('alert')
export class AlertController {
  constructor(private alertService: AlertService) {}

  @Get('new/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new alert for a user' })
  @ApiParam({ name: 'id', description: 'Target user ID', type: String })
  @ApiResponse({ status: 201, description: 'Alert created.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createAlert(@Param('id') userId: string, @Req() req): Promise<any> {
    return this.alertService.createAlert(req.user._id, userId);
  }

  @Get('alert-number')
  @ApiOperation({
    summary: 'Get the number of alerts for the authenticated user',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Number of alerts returned.' })
  @UsePipes(ValidationPipe)
  async getAlertsNumber(@Req() req): Promise<any> {
    return this.alertService.getAlertsNumber(req.user._id);
  }

  @Get('alerts-list/:id')
  @ApiOperation({ summary: 'Get the list of alerts for a user' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page',
  })
  @ApiResponse({ status: 200, description: 'List of alerts returned.' })
  @UsePipes(ValidationPipe)
  async getAlertsList(
    @Param('id') userId: string,
    @Query() query: ExpressQuery,
  ): Promise<any> {
    return this.alertService.getAlertsList(userId, query);
  }
}
