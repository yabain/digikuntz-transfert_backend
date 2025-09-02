/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

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
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllTransactoins(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Transaction[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.transactionService.findAll(query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction data by ID' })
  @ApiParam({ name: 'id', description: 'Transaction ID', type: String })
  @ApiResponse({ status: 200, description: 'Transaction data returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getTransactionData(
    @Param('id') transactionId: string,
    @Req() req,
  ): Promise<any> {
    return this.transactionService.findById(transactionId, req.user);
  }

  @Post('new')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process a new payment transaction' })
  @ApiBody({
    schema: {
      example: {
        amount: 100,
        fromCurrency: 'USD',
        toCurrency: 'XAF',
        sender: 'userId',
        receiver: 'userId',
        // ...Other field
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Transaction processed.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async processPayment(@Body() transactionData: any, @Req() req): Promise<any> {
    return this.transactionService.processPayment(transactionData, req.user);
  }

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
