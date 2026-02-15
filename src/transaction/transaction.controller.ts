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
  @ApiResponse({ status: 200, description: 'Plans Statistics.' })
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
  @ApiResponse({ status: 200, description: 'Plans Statistics.' })
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
  async getTransactionData(@Param('id') transactionId: string): Promise<any> {
    return this.transactionService.findById(transactionId);
  }

  // @Post('new')
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Process a new payment transaction' })
  // @ApiBody({
  //   schema: {
  //     example: {
  //       amount: 100,
  //       fromCurrency: 'USD',
  //       toCurrency: 'XAF',
  //       sender: 'userId',
  //       receiver: 'userId',
  //       // ...Other field
  //     },
  //   },
  // })
  // @ApiResponse({ status: 201, description: 'Transaction processed.' })
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  // async processPayment(@Body() transactionData: any, @Req() req): Promise<any> {
  //   return this.transactionService.processPayment(transactionData, req.user);
  // }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a transaction by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'Transaction ID', type: String })
  @ApiResponse({ status: 200, description: 'Transaction deleted.' })
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
