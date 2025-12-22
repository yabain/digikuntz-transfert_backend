/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiConsumes,
  ApiProduces,
} from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { Subscription } from './subscription.schema';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { UpdateSubscriptionDto } from './update-subscription.dto';

/**
 * Subscription Controller
 * Handles all subscription-related operations including CRUD operations,
 * user subscriptions, plan access verification, and administrative functions.
 */
@ApiTags('Subscriptions')
@Controller('subscription')
export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  // ========== ADMIN ROUTES ==========

  /**
   * Get all subscriptions (admin only)
   * @param query - Search and pagination parameters
   * @param req - Request object containing user information
   * @returns List of all subscriptions
   */
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get all subscriptions',
    description: 'Retrieve all subscriptions in the system. Admin access required.',
    tags: ['Admin']
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter for subscription titles',
    example: 'premium'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'List of subscriptions returned successfully.',
    type: [Subscription]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Admin access required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllSubscriptions(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Subscription[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    return this.subscriptionService.getAllSubscriptions(query);
  }

  /**
   * Get subscription statistics (admin only)
   * @param req - Request object containing user information
   * @returns Subscription statistics
   */
  @Get('statistics')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get subscription statistics',
    description: 'Retrieve comprehensive statistics about subscriptions. Admin access required.',
    tags: ['Admin']
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription statistics retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        subscribersNumber: { type: 'number', description: 'Total number of subscribers' },
        pourcentage: { type: 'number', description: 'Percentage of new subscribers in last 7 days' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Admin access required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getSubscriptionsStatistic(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    return this.subscriptionService.getSubscriptionsStatistic();
  }

  /**
   * Get expired subscriptions (admin only)
   * @param req - Request object containing user information
   * @returns List of expired subscriptions
   */
  @Get('expired')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get expired subscriptions',
    description: 'Retrieve all expired subscriptions. Admin access required.',
    tags: ['Admin']
  })
  @ApiResponse({ 
    status: 200, 
    description: 'List of expired subscriptions retrieved successfully.',
    type: [Subscription]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Admin access required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getExpiredSubscriptions(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    return this.subscriptionService.getExpiredSubscriptions();
  }

  /**
   * Update subscription status (admin only)
   * @param subscriptionId - ID of the subscription to update
   * @param req - Request object containing user information
   * @returns Updated subscription
   */
  @Put('status/:id')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Update subscription status',
    description: 'Toggle subscription status (active/inactive). Admin access required.',
    tags: ['Admin']
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Subscription ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription status updated successfully.' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Admin access required.' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Subscription not found.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateStatus(@Param('id') subscriptionId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    return this.subscriptionService.updateStatus(subscriptionId, true);
  }

  // ========== USER ROUTES ==========

  /**
   * Get user's subscriptions
   * @param req - Request object containing user information
   * @returns List of user's subscriptions
   */
  @Get('my-subscriptions')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get user subscriptions',
    description: 'Retrieve all subscriptions belonging to the authenticated user.',
    tags: ['User']
  })
  @ApiResponse({ 
    status: 200, 
    description: 'User subscriptions retrieved successfully.',
    type: [Subscription]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMySubscriptions(@Req() req): Promise<any> {
    return this.subscriptionService.getSubscriptionList(req.user._id);
  }

  /**
   * Get user's subscribers (plan authors only)
   * @param req - Request object containing user information
   * @returns List of subscribers to user's plans
   */
  @Get('my-subscribers')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get user subscribers',
    description: 'Retrieve all subscribers to plans created by the authenticated user.',
    tags: ['User']
  })
  @ApiResponse({ 
    status: 200, 
    description: 'User subscribers retrieved successfully.',
    type: [Subscription]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMySubscribers(@Req() req): Promise<any> {
    return this.subscriptionService.getSubscriberList(req.user._id);
  }

  /**
   * Verify if user has subscription to a plan
   * @param planId - ID of the plan to check
   * @param req - Request object containing user information
   * @returns Subscription verification result
   */
  @Get('verify/:planId')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Verify subscription to plan',
    description: 'Check if the authenticated user has a subscription to the specified plan.',
    tags: ['User']
  })
  @ApiParam({ 
    name: 'planId', 
    description: 'Plan ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription verification completed.',
    schema: {
      type: 'object',
      properties: {
        hasSubscription: { type: 'boolean', description: 'Whether user has subscription to the plan' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async verifySubscription(@Param('planId') planId: string, @Req() req): Promise<any> {
    return this.subscriptionService.verifySubscription(req.user._id, planId);
  }

  @Get('verify-with-user/:planId')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Verify subscription to plan',
    description: 'Check if the authenticated user has a subscription to the specified plan.',
    tags: ['User']
  })
  @ApiParam({ 
    name: 'planId', 
    description: 'Plan ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription verification completed.',
    schema: {
      type: 'object',
      properties: {
        hasSubscription: { type: 'boolean', description: 'Whether user has subscription to the plan' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UsePipes(ValidationPipe)
  async verifySubscriptionWithUserId(@Param('planId') allId: string): Promise<any> {
    const [planId, userId] = allId.split('AAA');
    return this.subscriptionService.verifySubscription(userId, planId);
  }

  /**
   * Check if user has access to a plan
   * @param planId - ID of the plan to check access for
   * @param req - Request object containing user information
   * @returns Access verification result
   */
  @Get('has-access/:planId')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Check plan access',
    description: 'Verify if the authenticated user has active access to the specified plan.',
    tags: ['User']
  })
  @ApiParam({ 
    name: 'planId', 
    description: 'Plan ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Access verification completed.',
    schema: {
      type: 'object',
      properties: {
        hasAccess: { type: 'boolean', description: 'Whether user has active access to the plan' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async hasAccessToPlan(@Param('planId') planId: string, @Req() req): Promise<any> {
    const hasAccess = await this.subscriptionService.hasAccessToPlan(req.user._id, planId);
    return { hasAccess };
  }

  /**
   * Check if subscription is active
   * @param subscriptionId - ID of the subscription to check
   * @returns Subscription active status
   */
  @Get('is-active/:subscriptionId')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Check subscription status',
    description: 'Verify if the specified subscription is currently active.',
    tags: ['User']
  })
  @ApiParam({ 
    name: 'subscriptionId', 
    description: 'Subscription ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription status retrieved.',
    schema: {
      type: 'object',
      properties: {
        isActive: { type: 'boolean', description: 'Whether the subscription is active' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async isSubscriptionActive(@Param('subscriptionId') subscriptionId: string): Promise<any> {
    const isActive = await this.subscriptionService.isSubscriptionActive(subscriptionId);
    return { isActive };
  }

  // ========== CRUD ROUTES ==========

  /**
   * Get subscription by ID
   * @param subscriptionId - ID of the subscription to retrieve
   * @returns Subscription data
   */
  @Get(':id')
  @ApiOperation({ 
    summary: 'Get subscription by ID',
    description: 'Retrieve a specific subscription by its ID.',
    tags: ['CRUD']
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Subscription ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription data retrieved successfully.',
    type: Subscription
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Subscription not found.' 
  })
  async getSubscription(@Param('id') subscriptionId: string): Promise<any> {
    return this.subscriptionService.getSubscriptionById(subscriptionId);
  }

  /**
   * Create a new subscription
   * @param subscription - Subscription data
   * @param req - Request object containing user information
   * @returns Created subscription
   */
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Create subscription',
    description: 'Create a new subscription for the authenticated user.',
    tags: ['CRUD']
  })
  @ApiBody({ 
    type: CreateSubscriptionDto,
    description: 'Subscription creation data',
    examples: {
      monthly: {
        summary: 'Monthly subscription',
        value: {
          planId: '507f1f77bcf86cd799439011',
          cycle: 'monthly',
          quantity: 1,
          status: true
        }
      },
      yearly: {
        summary: 'Yearly subscription',
        value: {
          planId: '507f1f77bcf86cd799439011',
          cycle: 'yearly',
          quantity: 1,
          status: true
        }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Subscription created successfully.',
    type: Subscription
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad request - Invalid subscription data.' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createSubscription(
    @Body() subscriptionData: CreateSubscriptionDto,
    // @Req() req,
  ): Promise<any> {
    return this.subscriptionService.subscribe(subscriptionData);
  }

  /**
   * Update subscription (extend duration)
   * @param subscriptionId - ID of the subscription to update
   * @param subscriptionData - Updated subscription data
   * @returns Updated subscription
   */
  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Update subscription',
    description: 'Update an existing subscription, typically to extend its duration.',
    tags: ['CRUD']
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Subscription ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiBody({ 
    type: UpdateSubscriptionDto,
    description: 'Subscription update data',
    examples: {
      extend: {
        summary: 'Extend subscription',
        value: {
          quantity: 3,
          cycle: 'monthly'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription updated successfully.',
    type: Subscription
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad request - Invalid update data.' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Subscription not found.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateSubscription(
    @Param('id') subscriptionId: string,
    @Body() subscriptionData: UpdateSubscriptionDto,
  ): Promise<any> {
    return this.subscriptionService.updateSubscription(
      subscriptionId,
      subscriptionData,
    );
  }

  /**
   * Renew subscription
   * @param subscriptionId - ID of the subscription to renew
   * @param body - Renewal data containing additional quantity
   * @returns Renewed subscription
   */
  @Put('renew/:id')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Renew subscription',
    description: 'Renew an existing subscription by adding additional cycles.',
    tags: ['CRUD']
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Subscription ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        additionalQuantity: { 
          type: 'number', 
          description: 'Additional cycles to add to the subscription',
          example: 3,
          minimum: 1
        }
      },
      required: ['additionalQuantity']
    },
    examples: {
      renew: {
        summary: 'Renew for 3 more months',
        value: {
          additionalQuantity: 3
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription renewed successfully.',
    type: Subscription
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad request - Invalid renewal data.' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Subscription not found.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async renewSubscription(
    @Param('id') subscriptionId: string,
    @Body() body: { additionalQuantity: number },
  ): Promise<any> {
    return this.subscriptionService.renewSubscription(subscriptionId, body.additionalQuantity);
  }

  /**
   * Stop subscription
   * @param subscriptionId - ID of the subscription to stop
   * @param subscriptionData - Subscription data
   * @param req - Request object containing user information
   * @returns Stopped subscription
   */
  @Put('stop/:id')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Stop subscription',
    description: 'Stop an active subscription, making it inactive.',
    tags: ['CRUD']
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Subscription ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiBody({ 
    type: UpdateSubscriptionDto,
    description: 'Subscription data for stopping',
    examples: {
      stop: {
        summary: 'Stop subscription',
        value: {
          status: false
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription stopped successfully.',
    type: Subscription
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Subscription not found.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async stopSubscription(
    @Param('id') subscriptionId: string,
    @Body() subscriptionData: UpdateSubscriptionDto,
    @Req() req,
  ): Promise<any> {
    return this.subscriptionService.stopSubscription(subscriptionId, subscriptionData, req.user);
  }

  /**
   * Edit subscription
   * @param subscriptionId - ID of the subscription to edit
   * @param subscriptionData - Updated subscription data
   * @param req - Request object containing user information
   * @returns Edited subscription
   */
  @Put('edit/:id')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Edit subscription',
    description: 'Edit an existing subscription with new data.',
    tags: ['CRUD']
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Subscription ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiBody({ 
    type: UpdateSubscriptionDto,
    description: 'Updated subscription data',
    examples: {
      edit: {
        summary: 'Edit subscription',
        value: {
          cycle: 'yearly',
          quantity: 2,
          status: true
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription edited successfully.',
    type: Subscription
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Subscription not found.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async editSubscription(
    @Param('id') subscriptionId: string,
    @Body() subscriptionData: UpdateSubscriptionDto,
    @Req() req,
  ): Promise<any> {
    return this.subscriptionService.editSubscription(subscriptionId, subscriptionData, req.user);
  }

  /**
   * Delete subscription
   * @param subscriptionId - ID of the subscription to delete
   * @param req - Request object containing user information
   * @returns Deletion confirmation
   */
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Delete subscription',
    description: 'Permanently delete a subscription.',
    tags: ['CRUD']
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Subscription ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Subscription deleted successfully.' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Subscription not found.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async deleteSubscription(
    @Param('id') subscriptionId: string,
    @Req() req,
  ): Promise<any> {
    return this.subscriptionService.deleteSubscription(subscriptionId, req.user);
  }

  // ========== SEARCH ROUTES ==========

  /**
   * Search subscriptions by title
   * @param query - Search parameters
   * @returns Search results
   */
  @Get('search')
  @ApiOperation({ 
    summary: 'Search subscriptions',
    description: 'Search for subscriptions by title with pagination support.',
    tags: ['Search']
  })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: 'Search keyword for subscription titles',
    example: 'premium'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Search results retrieved successfully.',
    type: [Subscription]
  })
  async searchSubscriptions(@Query() query: ExpressQuery): Promise<any> {
    return this.subscriptionService.searchByTitle(query);
  }

  // ========== ACTIVE/INACTIVE ROUTES ==========

  /**
   * Get active subscriptions (admin only)
   * @param query - Query parameters for filtering
   * @param req - Request object containing user information
   * @returns List of active subscriptions
   */
  @Get('active/list')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get active subscriptions',
    description: 'Retrieve all active subscriptions. Admin access required.',
    tags: ['Admin']
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter for subscription titles',
    example: 'premium'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'List of active subscriptions retrieved successfully.',
    type: [Subscription]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Admin access required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getActiveSubscriptions(@Query() query: ExpressQuery, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    return this.subscriptionService.getAllActiveSubscriptions(query);
  }


  /**
   * Upgrade subscription
   * @param data - Subscription upgrade data
   * @returns Upgraded subscription
   */
  // @Post('upgrade')
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  // async upgrateSubscription(
  //   @Body() data: any,
  //   @Req() req
  // ): Promise<any> {
  //   if (!req.user.isAdmin) {
  //     throw new NotFoundException('Unauthorized');
  //   }
  //   return this.subscriptionService.upgradeSubscription(data.subscriptionId, data.quantity);
  // }


  /**
   * Get subscriber of plan (all subscription of plan)
   */
  @Get('get-subscribers/:planId')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getSubscriptionsOfPlan(
    @Param('planId') planId: any,
  ): Promise<any> {
    return this.subscriptionService.getSubscriptionsOfPlan(planId);
  }

  @Get('get-user-subscription/:planId')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getSubscriptionsOfUser(
    @Param('planId') planId: any,
  ): Promise<any> {
    return this.subscriptionService.getSubscriptionsOfUser(planId);
  }

  @Get('get-items/:ids')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getSubscriptionsItemsOfUser(
    @Param('ids') ids: any,
  ): Promise<any> {
    const [subscriptionId, subscriberId] = ids.split('AAA');
    return this.subscriptionService.getSubscriptionsItemsOfUser(subscriptionId, subscriberId);
  }
}
