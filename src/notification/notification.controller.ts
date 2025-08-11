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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('notification')
@Controller('notification')
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  /**
   * Get the list of notifications for the authenticated user.
   */
  @Get('my-notifications')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all notifications for the authenticated user' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of notifications returned.' })
  @UseGuards(AuthGuard('jwt'))
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
   * Mark a notification as read for the authenticated user.
   */
  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID', type: String })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async makeAsReaded(
    @Param('id') notifId: string,
    @Req() req,
  ): Promise<boolean> {
    return this.notificationService.makeAsReaded(req.user._id, notifId);
  }

  /**
   * Get all unread notifications for the authenticated user.
   */
  @Get('unreaded-notifications')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all unread notifications for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of unread notifications returned.',
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getUnreadNotifications(@Req() req): Promise<Notification[]> {
    return this.notificationService.getUnreadNotifications(req.user._id);
  }
}
