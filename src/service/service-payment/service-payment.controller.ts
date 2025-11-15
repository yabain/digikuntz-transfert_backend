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
import { ServicePaymentService } from './service-payment.service';
import { ServicePayment } from './service-payment.schema';
import { CreateServicePaymentDto } from './create-service-payment.dto';
import { UpdateServicePaymentDto } from './update-service-payment.dto';

/**
 * ServicePayment Controller
 * Handles all service-payment-related operations including CRUD operations,
 * user service-payments, plan access verification, and administrative functions.
 */
@ApiTags('ServicePayments')
@Controller('service-payment')
export class ServicePaymentController {
  constructor(private servicePaymentService: ServicePaymentService) {}

  // ========== ADMIN ROUTES ==========

  /**
   * Get all service-payments (admin only)
   * @param query - Search and pagination parameters
   * @param req - Request object containing user information
   * @returns List of all service-payments
   */
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get all service-payments',
    description: 'Retrieve all service-payments in the system. Admin access required.',
    tags: ['Admin']
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter for service-payment titles',
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
    description: 'List of service-payments returned successfully.',
    type: [ServicePayment]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Admin access required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllServicePayments(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<ServicePayment[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    return this.servicePaymentService.getAllServicePayments(query);
  }

  /**
   * Get service-payment statistics (admin only)
   * @param req - Request object containing user information
   * @returns ServicePayment statistics
   */
  @Get('statistics')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get service-payment statistics',
    description: 'Retrieve comprehensive statistics about service-payments. Admin access required.',
    tags: ['Admin']
  })
  @ApiResponse({ 
    status: 200, 
    description: 'ServicePayment statistics retrieved successfully.',
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
  async getServicePaymentsStatistic(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    return this.servicePaymentService.getServicePaymentsStatistic();
  }



  /**
   * Get expired servicePayments (admin only)
   * @param req - Request object containing user information
   * @returns List of expired servicePayments
   */
  @Get('expired')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get expired servicePayments',
    description: 'Retrieve all expired servicePayments. Admin access required.',
    tags: ['Admin']
  })
  @ApiResponse({ 
    status: 200, 
    description: 'List of expired servicePayments retrieved successfully.',
    type: [ServicePayment]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Admin access required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getExpiredServicePayments(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    return this.servicePaymentService.getExpiredServicePayments();
  }

  // ========== USER ROUTES ==========

  /**
   * Get user's servicePayments
   * @param req - Request object containing user information
   * @returns List of user's servicePayments
   */
  @Get('my-servicePayments')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get user servicePayments',
    description: 'Retrieve all servicePayments belonging to the authenticated user.',
    tags: ['User']
  })
  @ApiResponse({ 
    status: 200, 
    description: 'User servicePayments retrieved successfully.',
    type: [ServicePayment]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyServicePayments(@Req() req): Promise<any> {
    return this.servicePaymentService.getServicePaymentList(req.user._id);
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
    type: [ServicePayment]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMySubscribers(@Req() req): Promise<any> {
    return this.servicePaymentService.getPayerList(req.user._id);
  }

  /**
   * Verify if user has servicePayment to a service
   * @param planId - ID of the plan to check
   * @param req - Request object containing user information
   * @returns ServicePayment verification result
   */
  @Get('verify/:planId')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Verify servicePayment to plan',
    description: 'Check if the authenticated user has a servicePayment to the specified plan.',
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
    description: 'ServicePayment verification completed.',
    schema: {
      type: 'object',
      properties: {
        hasServicePayment: { type: 'boolean', description: 'Whether user has servicePayment to the plan' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async verifyServicePayment(@Param('planId') planId: string, @Req() req): Promise<any> {
    return this.servicePaymentService.verifyServicePayment(req.user._id, planId);
  }

  @Get('verify-with-user/:planId')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Verify servicePayment to plan',
    description: 'Check if the authenticated user has a servicePayment to the specified plan.',
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
    description: 'ServicePayment verification completed.',
    schema: {
      type: 'object',
      properties: {
        hasServicePayment: { type: 'boolean', description: 'Whether user has servicePayment to the plan' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UsePipes(ValidationPipe)
  async verifyServicePaymentWithUserId(@Param('planId') allId: string): Promise<any> {
    const [planId, userId] = allId.split('AAA');
    return this.servicePaymentService.verifyServicePayment(userId, planId);
  }

  @Get('item-statistics/:id')
  @ApiBearerAuth()
  async getItemStatistics(@Param('id') userId: string, @Req() req): Promise<any> {
    return this.servicePaymentService.getItemStatistics(userId);
  }

  /**
   * Get servicePayment by ID
   * @param servicePaymentId - ID of the servicePayment to retrieve
   * @returns ServicePayment data
   */
  @Get(':id')
  @ApiOperation({ 
    summary: 'Get servicePayment by ID',
    description: 'Retrieve a specific servicePayment by its ID.',
    tags: ['CRUD']
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ServicePayment ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'ServicePayment data retrieved successfully.',
    type: ServicePayment
  })
  @ApiResponse({ 
    status: 404, 
    description: 'ServicePayment not found.' 
  })
  async getServicePayment(@Param('id') servicePaymentId: string): Promise<any> {
    return this.servicePaymentService.getServicePaymentById(servicePaymentId);
  }

  /**
   * Create a new servicePayment
   * @param servicePayment - ServicePayment data
   * @param req - Request object containing user information
   * @returns Created servicePayment
   */
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Create servicePayment',
    description: 'Create a new servicePayment for the authenticated user.',
    tags: ['CRUD']
  })
  @ApiBody({ 
    type: CreateServicePaymentDto,
    description: 'ServicePayment creation data',
    examples: {
      monthly: {
        summary: 'Monthly servicePayment',
        value: {
          planId: '507f1f77bcf86cd799439011',
          cycle: 'monthly',
          quantity: 1,
          status: true
        }
      },
      yearly: {
        summary: 'Yearly servicePayment',
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
    description: 'ServicePayment created successfully.',
    type: ServicePayment
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad request - Invalid servicePayment data.' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createServicePayment(
    @Body() servicePaymentData: CreateServicePaymentDto,
    // @Req() req,
  ): Promise<any> {
    return this.servicePaymentService.createServicePayment(servicePaymentData);
  }


  /**
   * Delete servicePayment
   * @param servicePaymentId - ID of the servicePayment to delete
   * @param req - Request object containing user information
   * @returns Deletion confirmation
   */
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Delete servicePayment',
    description: 'Permanently delete a servicePayment.',
    tags: ['CRUD']
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ServicePayment ID', 
    type: String,
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'ServicePayment deleted successfully.' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Authentication required.' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'ServicePayment not found.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async deleteServicePayment(
    @Param('id') servicePaymentId: string,
    @Req() req,
  ): Promise<any> {
    return this.servicePaymentService.deleteServicePayment(servicePaymentId, req.user);
  }

  // ========== SEARCH ROUTES ==========

  /**
   * Search servicePayments by title
   * @param query - Search parameters
   * @returns Search results
   */
  @Get('search')
  @ApiOperation({ 
    summary: 'Search servicePayments',
    description: 'Search for servicePayments by title with pagination support.',
    tags: ['Search']
  })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: 'Search keyword for servicePayment titles',
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
    type: [ServicePayment]
  })
  async searchServicePayments(@Query() query: ExpressQuery): Promise<any> {
    return this.servicePaymentService.searchByTitle(query);
  }

  // ========== ACTIVE/INACTIVE ROUTES ==========

  /**
   * Get active servicePayments (admin only)
   * @param query - Query parameters for filtering
   * @param req - Request object containing user information
   * @returns List of active servicePayments
   */
  @Get('active/list')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get active servicePayments',
    description: 'Retrieve all active servicePayments. Admin access required.',
    tags: ['Admin']
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter for servicePayment titles',
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
    description: 'List of active servicePayments retrieved successfully.',
    type: [ServicePayment]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Admin access required.' 
  })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getActiveServicePayments(@Query() query: ExpressQuery, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    return this.servicePaymentService.getAllActiveServicePayments(query);
  }

  @Get('get-user-servicePayment/:userId')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getServicePaymentsOfUser(
    @Param('userId') planId: any,
  ): Promise<any> {
    return this.servicePaymentService.getServicePaymentsOfUser(planId);
  }
}
