/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';

@Controller('notification')
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  /**
   * Get all users with optional query parameters for filtering and pagination.
   * @param query - Query parameters for filtering and pagination.
   * @returns A list of users.
   */
  @Get('my-notifications')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe)
  async getNotificationsListOfUser(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Notification[]> {
    return this.notificationService.getNotificationsListOfUser(
      req.user._id,
      query,
    );
  }

  /**
   * Get all users with optional query parameters for filtering and pagination.
   * @param query - Query parameters for filtering and pagination.
   * @returns A list of users.
   */
  @Put(':id')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe)
  async makeAsReaded(
    @Param('id') notifId: string,
    @Req() req,
  ): Promise<boolean> {
    return this.notificationService.makeAsReaded(req.user._id, notifId);
  }

  @Get('unreaded-notifications')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getUnreadNotifications(@Req() req): Promise<Notification[]> {
    return this.notificationService.getUnreadNotifications(req.user._id);
  }
}
