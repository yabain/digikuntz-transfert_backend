/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
//   BadRequestException,
  Body,
  Controller,
//   Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
//   Res,
//   UploadedFiles,
  UseGuards,
//   UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';
// import { FilesInterceptor } from '@nestjs/platform-express';
// import { multerConfigForSubscriptions } from '..//multer.config';
// import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
//   ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { Subscription } from './subscription.schema';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { UpdateSubscriptionDto } from './update-subscription.dto';

@Controller('subscription')
export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  /**
   * Get all users with optional query parameters for filtering and pagination.
   * Only accessible by admin users.
   */
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all subscription (admin only)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of subscription returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllSubscriptions(@Query() query: ExpressQuery, @Req() req): Promise<Subscription[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.subscriptionService.getAllSubscriptions(query);
  }

  /**
   * Get all users with optional query parameters for filtering and pagination.
   * Only accessible by admin users.
   */
  @Get('get-subscription-statistic')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about all subscriptions (admin only)' })
  @ApiResponse({ status: 200, description: 'Subscription Statistic.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getSubscriptionsStatistic(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.subscriptionService.getSubscriptionsStatistic();
  }

  @Get('get-subscriptions-data/:id')
  @ApiOperation({ summary: 'Get subscription data by ID' })
  @ApiParam({ name: 'id', description: 'subscription ID', type: String })
  @ApiResponse({ status: 200, description: 'subscription data returned.' })
  async getSubscription(@Param('id') subscriptionId: string): Promise<any> {
    return this.subscriptionService.getSubscriptionById(subscriptionId);
  }

  @Post('new')
  @ApiOperation({ summary: 'Create a new subscription' })
  @ApiBody({ type: CreateSubscriptionDto })
  @ApiResponse({ status: 201, description: 'subscription created.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createSubscriptions(@Body() subscription: CreateSubscriptionDto, @Req() req): Promise<any> {
    return this.subscriptionService.creatSubscription(subscription, req.user);
  }

  @Put('update-subscription')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the profile of the authenticated subscription' })
  @ApiBody({ type: UpdateSubscriptionDto })
  @ApiResponse({ status: 200, description: 'Subscriptions profile updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async update(@Body() subscriptionData: UpdateSubscriptionDto, @Req() req): Promise<any> {
    return this.subscriptionService.updateSubscription(req.user._id, subscriptionData);
  }

//   @Put('picture')
//   @ApiBearerAuth()
//   @ApiConsumes('multipart/form-data')
//   @ApiOperation({
//     summary: 'Update the picture',
//   })
//   @ApiBody({
//     schema: {
//       type: 'object',
//       properties: {
//         pictureFile: {
//           type: 'string',
//           format: 'binary',
//           description: 'Profile picture file',
//         },
//       },
//     },
//   })
//   @ApiResponse({ status: 200, description: 'Subscriptions profile picture updated.' })
//   @UseInterceptors(FilesInterceptor('pictureFile', 1, multerConfigForSubscriptions))
//   @UseGuards(AuthGuard('jwt'))
//   @UsePipes(ValidationPipe)
//   async updatePicture(
//     @Req() req,
//     @UploadedFiles() picture: Array<Express.Multer.File>,
//   ): Promise<any> {
//     if (!picture || picture.length === 0) {
//       throw new BadRequestException('No file uploaded');
//     }
//     return this.subscriptionService.updateSubscriptionsPicture(req, picture);
//   }

//   @Delete(':id')
//   @ApiBearerAuth()
//   @ApiOperation({ summary: 'Delete a user by ID (admin only)' })
//   @ApiParam({ name: 'id', description: 'Subscriptions ID', type: String })
//   @ApiResponse({ status: 200, description: 'Subscriptions deleted.' })
//   @UseGuards(AuthGuard('jwt'))
//   async delete(@Param('id') userId: string, @Req() req): Promise<any> {
//     if (!req.user.isAdmin) {
//       throw new NotFoundException('Unautorised');
//     }
//     return this.subscriptionService.deleteSubscriptions(userId);
//   }

//   @Get('research')
//   @ApiOperation({ summary: 'Search for users by name' })
//   @ApiQuery({
//     name: 'search',
//     required: false,
//     type: String,
//     description: 'Search filter',
//   })
//   @ApiResponse({
//     status: 200,
//     description: 'List of users matching the search criteria.',
//   })
//   async userResearch(@Query() query: ExpressQuery): Promise<any> {
//     return this.subscriptionService.searchByName(query);
//   }

//   @Put('update-status')
//   @ApiBearerAuth()
//   @ApiOperation({ summary: 'Update user status' })
//   @ApiBody({ type: UpdateSubscriptionsDto })
//   @ApiResponse({ status: 200, description: 'Subscriptions profile updated.' })
//   @UseGuards(AuthGuard('jwt'))
//   @UsePipes(ValidationPipe)
//   async updateStatus(@Body() userId: string, @Req() req): Promise<any> {
//     if (!req.user.isAdmin) {
//       throw new NotFoundException('Unautorised');
//     }
//     return this.subscriptionService.updateStatus(userId);
//   }

//   @Put('update-adminStatus')
//   @ApiBearerAuth()
//   @ApiOperation({ summary: 'Update admin profile status' })
//   @ApiBody({ type: UpdateSubscriptionsDto })
//   @ApiResponse({ status: 200, description: 'Subscriptions profile updated.' })
//   @UseGuards(AuthGuard('jwt'))
//   @UsePipes(ValidationPipe)
//   async updateAdminStatus(@Body() userId: string, @Req() req): Promise<any> {
//     if (!req.user.isAdmin) {
//       throw new NotFoundException('Unautorised');
//     }
//     return this.subscriptionService.updateAdminStatus(userId);
//   }

//   @Put('update-verifiedStatus')
//   @ApiBearerAuth()
//   @ApiOperation({ summary: 'Update verified profile status' })
//   @ApiBody({ type: UpdateSubscriptionsDto })
//   @ApiResponse({ status: 200, description: 'Subscriptions profile updated.' })
//   @UseGuards(AuthGuard('jwt'))
//   @UsePipes(ValidationPipe)
//   async updateVerifiedStatus(@Body() userId: string, @Req() req): Promise<any> {
//     if (!req.user.isAdmin) {
//       throw new NotFoundException('Unautorised');
//     }
//     return this.subscriptionService.updateVerifiedStatus(userId);
//   }
}
