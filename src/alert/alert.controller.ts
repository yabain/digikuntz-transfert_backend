/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Delete,
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

@Controller('alert')
export class AlertController {
  constructor(private alertService: AlertService) {}

  @Get('new/:id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createAlert(@Param('id') userId: string, @Req() req): Promise<any> {
    return this.alertService.createAlert(req.user._id, userId);
  }

  @Get('alert-number')
  @UsePipes(ValidationPipe)
  async getAlertsNumber(@Req() req): Promise<any> {
    return this.alertService.getAlertsNumber(req.user._id);
  }

  @Get('alerts-list/:id')
  @UsePipes(ValidationPipe)
  async getAlertsList(
    @Param('id') userId: string,
    @Query() query: ExpressQuery,
  ): Promise<any> {
    return this.alertService.getAlertsList(userId, query);
  }
}
