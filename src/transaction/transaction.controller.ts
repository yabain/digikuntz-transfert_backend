/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  Sse,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Observable } from 'rxjs';
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
      throw new ForbiddenException('Unauthorised');
    }
    return this.transactionService.findAll(query);
  }

  @Get('all-payout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all payout transactions (admin only)' })
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
      throw new ForbiddenException('Unauthorised');
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
      throw new ForbiddenException('Unauthorised');
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
    if (!this.isSameId(req.user?._id, userId) && !req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
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
  @ApiResponse({
    status: 200,
    description: 'Payout list returned.',
    schema: {
      example: {
        _id: '6a341f60841d03dcfbf8b2f4',
        transactionType: 'withdrawal',
        estimation: '5000',
        transactionRef: 'IN598#260618164000',
        receiverCurrency: 'XAF',
        status: 'transaction_payin_success',
        isApiPayout: false,
        createdAt: '2026-06-18T16:40:00.590Z',
        updatedAt: '2026-06-19T18:43:10.624Z',
      },
    },
  })
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
      throw new ForbiddenException('Unauthorised');
    }
    return this.transactionService.getPayoutListByStatus(status, query);
  }

  @Get('my-statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction statistics for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Current user transaction statistics.',
    schema: {
      example: {
        totalPayoutTransactions: 10,
        totalPayinTransactions: 25,
        totalTransactions: 35,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyTransactionsStatistics(@Req() req): Promise<any> {
    return this.transactionService.getTransactionsStatisticsOfUser(req.user._id);
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
      throw new ForbiddenException('Unauthorised');
    }
    return this.transactionService.getTransactionsStatistics();
  }

  @Put('reject-payout/:transactionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a payout awaiting admin validation (admin only)' })
  @ApiParam({ name: 'transactionId', example: '6a341f60841d03dcfbf8b2f4', description: 'Internal transaction ID' })
  @ApiResponse({
    status: 200,
    description: 'Payout transaction rejected and balance refunded.',
    schema: {
      example: {
        _id: '6a341f60841d03dcfbf8b2f4',
        status: 'transaction_payout_rejected',
        transactionType: 'withdrawal',
        estimation: '5000',
        transactionRef: 'IN598#260618164000',
        createdAt: '2026-06-18T16:40:00.590Z',
        updatedAt: '2026-06-19T18:43:10.624Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @ApiResponse({ status: 404, description: 'Transaction not found or not eligible for rejection.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async rejectPayoutTransaction(
    @Param('transactionId') transactionId: string,
    @Req() req,
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.transactionService.rejectPayoutTransaction(transactionId);
  }

  @Get('investigation-balance/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Admin investigation endpoint: recompute user balance from transactions',
  })
  @ApiParam({ name: 'userId', description: 'Receiver user ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Computed balance from successful payin/payout transactions.',
    schema: {
      example: {
        userId: '687e9808955330d84e75f272',
        balance: 12345,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  async investigateBalance(@Param('userId') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.transactionService.investigateBalanceByReceiver(userId);
  }

  @Post('reconcile/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Réconcilier le solde d\'un utilisateur en vérifiant chaque transaction chez Flutterwave',
  })
  @ApiParam({ name: 'userId', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'Rapport de réconciliation.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  async reconcileBalance(@Param('userId') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.transactionService.reconcileUserBalance(userId);
  }

  @Post('reconcile/:userId/stream')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Réconcilier avec logs temps réel (stream SSE)',
  })
  @ApiParam({ name: 'userId', description: 'User ID', type: String })
  @UseGuards(AuthGuard('jwt'))
  async reconcileBalanceStream(@Param('userId') userId: string, @Req() req, @Res() res): Promise<void> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const report = await this.transactionService.reconcileUserBalance(userId, (msg: string) => {
      res.write(`data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'report', ...report })}\n\n`);
    res.end();
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction data by ID' })
  @ApiParam({ name: 'id', description: 'Transaction ID', type: String })
  @ApiResponse({ status: 200, description: 'Transaction data returned.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @UseGuards(AuthGuard('jwt'))
  async getTransactionData(
    @Param('id') transactionId: string,
    @Req() req,
  ): Promise<any> {
    const transaction = await this.transactionService.findById(transactionId);
    if (!req.user?.isAdmin && !this.isUserRelatedToTransaction(req.user?._id, transaction)) {
      throw new ForbiddenException('Unauthorised');
    }
    return transaction;
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

  private isUserRelatedToTransaction(userId: any, transaction: any): boolean {
    return [
      transaction?.senderId,
      transaction?.receiverId,
      transaction?.userId?._id,
      transaction?.userId,
    ].some((candidate) => this.isSameId(userId, candidate));
  }

  private isSameId(left: any, right: any): boolean {
    if (!left || !right) return false;
    return String(left) === String(right);
  }
}
