/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  HttpCode,
  UseGuards,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { CreatePayoutDto } from 'src/payout/payout.dto';
import { AuthGuard } from '@nestjs/passport';
import { Query as ExpressQuery } from 'express-serve-static-core';

@Controller('fw')
export class FlutterwaveController {
  constructor(private readonly fw: FlutterwaveService) {}

  @Get('balance/:countryWallet')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  getBalance(@Param('countryWallet') countryWallet, @Req() req) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.fw.getBalance(countryWallet);
  }

  @Get('payin-transactons/:countryWallet')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  listPayinTransactions(
    @Query() query: ExpressQuery,
    @Param('countryWallet') countryWallet,
    @Req() req,
  ) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.fw.listPayinTransactions(countryWallet, query);
  }

  @Get('payout-transactons/:countryWallet')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  listPayoutTransactions(
    @Param('countryWallet') countryWallet,
    @Query() query: ExpressQuery,
    @Req() req,
  ) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.fw.listPayoutTransactions(countryWallet, query);
  }

  @Get('transactions')
  listTx(@Query('page') page?: number, @Query('status') status?: string) {
    return this.fw.listTransactions({ page, status });
  }

  @Post('payin')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createPayin(@Body() transactionData: any, @Req() req) {
    return this.fw.createPayin(transactionData, req.user._id);
  }

  @Get('verify-payin/:txRef')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  verify(@Param('txRef') txRef: string) {
    return this.fw.verifyPayin(txRef);
  }

  @Get('get-bank/:code')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  getBanksList(@Param('code') countryCode: string) {
    return this.fw.getBanksList(countryCode);
  }

  @Post('payout')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createPayout(@Body() dto: CreatePayoutDto) {
    return this.fw.createPayout(dto);
  }

  // Webhook: this route must be PUBLIC (override guard upstream if needed)
  @Post('webhook')
  @HttpCode(200) // FW attend 200 sinon il retente
  async handleWebhook(@Req() req: Request) {
    return this.fw.verifyWebhookPayin(req);
  }

  @Get('verify-close-payin/:id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  verifyAndClosePayin(@Param('id') txRef: string, @Req() req) {
    console.log('verifyAndClosePayin tx: ', txRef, req.user._id);
    return this.fw.verifyAndClosePayin(txRef, req.user._id);
  }

  @Get('open-payin/:id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  openPayin(@Param('id') txRef: string, @Req() req) {
    return this.fw.openPayin(txRef, req.user._id);
  }
}
