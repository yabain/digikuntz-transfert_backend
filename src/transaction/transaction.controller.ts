/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  BadRequestException,
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
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { TransactionService } from './transaction.service';
import { Transaction } from './transaction.schema';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('transaction')
@Controller('transaction')
export class TransactionController {
  constructor(private transactionService: TransactionService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all transactions (admin only)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of transactions returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllTransactoins(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Transaction[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.transactionService.findAll(query);
  }

  @Get('all-payout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all transactions (admin only)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of transactions returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllPayoutTransactoins(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Transaction[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.transactionService.getAllPayoutTransactoins(query);
  }

  @Get('all-payin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all payin transactions (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'List of payins returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllPayinTransactions(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Transaction[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.transactionService.getAllPayinTransactions(query);
  }

  @Get('user-transactions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get paginated transactions for one user' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Paginated user transactions.',
    schema: {
      example: {
        data: [],
        pagination: {
          currentPage: 1,
          limit: 20,
          totalPages: 1,
          totalItems: 0,
          hasNextPage: false,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 404, description: 'User/transaction resource not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllTransactoinsOfUser(
    @Param('id') userId: string,
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Transaction[]> {
    return this.transactionService.getAllTransactionsOfUser(userId, query);
  }

  @Get('get-payout-list/:status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payout transaction regarding status (admin only)' })
  @ApiParam({
    name: 'status',
    description: 'Payout status filter',
    enum: ['pending', 'accepted', 'rejected', 'error'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Plans Statistics.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getPayoutListByStatus(
    @Param('status') status: string,
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.transactionService.getPayoutListByStatus(status, query);
  }

  @Get('get-statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about all plans (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Transactions statistics.',
    schema: {
      example: {
        rejectedTransactions: 5,
        pendingTransactions: 12,
        endedTransactions: 90,
        errorTransactions: 3,
        totalPayoutTransactions: 110,
        totalPayinTransactions: 142,
        totalTransactions: 300,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getTransactionsStatistics(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.transactionService.getTransactionsStatistics();
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction data by ID' })
  @ApiParam({ name: 'id', description: 'Transaction ID', type: String })
  @ApiResponse({ status: 200, description: 'Transaction data returned.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  async getTransactionData(@Param('id') transactionId: string): Promise<any> {
    return this.transactionService.findById(transactionId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a transaction by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'Transaction ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Transaction deleted.',
    schema: {
      example: {
        _id: '65f0aa12d4b1c2f1a8a4f000',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request / unauthorised.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') transactionId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) throw new BadRequestException('Unauthorised !');
    return this.transactionService.deleteTransaction(transactionId);
  }

  // Redirections (not documented in Swagger)
  @Get('*path')
  getRedirect(@Res() res: Response) {
    return res.redirect('https://payments.digikuntz.com');
  }

  @Post('*path')
  postRedirect(@Res() res: Response) {
    return res.redirect('https://payments.digikuntz.com');
  }

  @Put('*path')
  putRedirect(@Res() res: Response) {
    return res.redirect('https://payments.digikuntz.com');
  }

  @Delete('*path')
  deleteRedirect(@Res() res: Response) {
    return res.redirect('https://payments.digikuntz.com');
  }
}
