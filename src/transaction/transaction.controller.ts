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

@Controller('transaction')
export class TransactionController {
  constructor(private transactionService: TransactionService) {}

  @Get()
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe) // Validate the incoming data
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
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe) // Validate the incoming data
  async getTransactionData(
    @Param('id') transactionId: string,
    @Req() req,
  ): Promise<any> {
    return this.transactionService.findById(transactionId, req.user);
  }

  @Post('new')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe) // Validate the incoming data
  async processPayment(@Body() transactionData: any, @Req() req): Promise<any> {
    return this.transactionService.processPayment(transactionData, req.user);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') transactionId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) throw new BadRequestException('Unauthorised !');
    return this.transactionService.deleteTransaction(transactionId);
  }

  //////////////////////////////////////////
  @Get('*path')
  getRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }

  @Post('*path')
  postRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }

  @Put('*path')
  putRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }

  @Delete('*path')
  deleteRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }
}
