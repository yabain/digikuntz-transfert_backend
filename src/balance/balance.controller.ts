/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Body,
  Controller,
  Get,ForbiddenException,
  NotFoundException,
  Param,
  Post,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BalanceService } from './balance.service';

@ApiTags('balance')
@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) { }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get balance of current user' })
  @ApiResponse({
    status: 200,
    description: 'Balance returned.',
    schema: { example: { _id: '664f...', userId: '664f...', balance: 25000, updatedAt: '2025-01-01T00:00:00.000Z' } },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getBalance(@Req() req): Promise<any> {
    return this.balanceService.getBalanceByUserId(req.user._id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get balance of a user by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Balance returned.',
    schema: { example: { _id: '664f...', userId: '664f...', balance: 25000, updatedAt: '2025-01-01T00:00:00.000Z' } },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getUserBalance(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.balanceService.getBalanceByUserId(userId);
  }

  @Get('user/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get balance of a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Balance returned.',
    schema: { example: { _id: '664f...', userId: '664f...', balance: 25000, updatedAt: '2025-01-01T00:00:00.000Z' } },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getBalanceOfUser(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.balanceService.getBalanceByUserId(userId);
  }

  @Post('credit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Credit balance of a user (admin only)' })
  @ApiBody({ schema: { example: { userId: '664f...', amount: 5000, currency: 'XAF' } } })
  @ApiResponse({
    status: 201,
    description: 'Balance credited.',
    schema: { example: { _id: '664f...', userId: '664f...', balance: 30000, updatedAt: '2025-01-01T00:00:00.000Z' } },
  })
  @ApiResponse({ status: 400, description: 'Currency mismatch or invalid user.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async creditBalance(
    @Req() req,
    @Body() body: any,): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.balanceService.creditBalance(body.userId, body.amount, body.currency);
  }

  @Post('debit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Debit balance of a user (admin only)' })
  @ApiBody({ schema: { example: { userId: '664f...', amount: 5000, currency: 'XAF' } } })
  @ApiResponse({
    status: 201,
    description: 'Balance debited.',
    schema: { example: { _id: '664f...', userId: '664f...', balance: 20000, updatedAt: '2025-01-01T00:00:00.000Z' } },
  })
  @ApiResponse({ status: 400, description: 'Insufficient balance, currency mismatch or invalid user.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async debitBalance(
    @Req() req,
    @Body() body: any,): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.balanceService.debitBalance(body.userId, body.amount, body.currency);
  }
}
