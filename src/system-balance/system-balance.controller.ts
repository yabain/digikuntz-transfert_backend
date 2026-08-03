/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SystemBalanceService } from './system-balance.service';

@ApiTags('system-balance')
@Controller('system-balance')
export class SystemBalanceController {
  constructor(private readonly systemBalanceService: SystemBalanceService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all system balances (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'System balances returned.',
    schema: {
      example: [{ _id: '664f...', currency: 'XAF', balance: 25000 }],
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAll(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.systemBalanceService.getAllSystemBalances();
  }

  @Get('movements')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List system balance movements (admin only)' })
  @ApiQuery({
    name: 'currency',
    required: false,
    description: 'Filter by currency',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page: 10, 25, 50, 100 (default 10)',
  })
  @ApiQuery({
    name: 'keyword',
    required: false,
    description: 'Search in key, type, reference, description',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by movement type: credit or debit',
  })
  @ApiResponse({
    status: 200,
    description: 'Paged movements returned.',
    schema: {
      example: { data: [], total: 0, page: 1, limit: 10, totalPages: 0 },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMovements(
    @Req() req,
    @Query()
    query: {
      currency?: string;
      page?: number;
      limit?: number;
      keyword?: string;
      type?: string;
    },
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.systemBalanceService.getMovements(query);
  }

  @Get(':currency')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get system balance by currency (admin only)' })
  @ApiParam({
    name: 'currency',
    description: 'Currency code (XAF, NGN, KES...)',
  })
  @ApiResponse({
    status: 200,
    description: 'System balance returned.',
    schema: { example: { _id: '664f...', currency: 'XAF', balance: 25000 } },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getByCurrency(
    @Param('currency') currency: string,
    @Req() req,
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.systemBalanceService.getSystemBalance(currency);
  }

  @Get(':currency/stats')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system balance stats for a currency (admin only)',
  })
  @ApiParam({
    name: 'currency',
    description: 'Currency code (XAF, NGN, KES...)',
  })
  @ApiResponse({
    status: 200,
    description: 'System balance stats returned.',
    schema: {
      example: {
        currency: 'XAF',
        balance: 25000,
        totalPayin: 30000,
        totalPayout: 5000,
        countPayin: 12,
        countPayout: 3,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getStats(
    @Param('currency') currency: string,
    @Req() req,
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.systemBalanceService.getStats(currency);
  }

  @Post('credit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Credit system balance (admin only)' })
  @ApiBody({
    schema: {
      example: {
        currency: 'XAF',
        amount: 5000,
        description: 'Recharge manuelle',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'System balance credited.',
    schema: { example: { _id: '664f...', currency: 'XAF', balance: 30000 } },
  })
  @ApiResponse({ status: 400, description: 'Invalid currency or amount.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async credit(
    @Req() req,
    @Body() body: { currency: string; amount: number; description?: string },
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    const idempotencyKey = `system-admin-credit:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    return this.systemBalanceService.creditSystemBalance(
      body.currency,
      body.amount,
      idempotencyKey,
      { description: body.description },
    );
  }

  @Post('debit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Debit system balance (admin only)' })
  @ApiBody({
    schema: {
      example: { currency: 'XAF', amount: 5000, description: 'Retrait manuel' },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'System balance debited.',
    schema: { example: { _id: '664f...', currency: 'XAF', balance: 20000 } },
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient system balance or invalid input.',
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async debit(
    @Req() req,
    @Body() body: { currency: string; amount: number; description?: string },
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    const idempotencyKey = `system-admin-debit:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    return this.systemBalanceService.debitSystemBalance(
      body.currency,
      body.amount,
      idempotencyKey,
      { description: body.description },
    );
  }
}
