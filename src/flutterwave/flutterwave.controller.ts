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
    console.log('(fw controller) transactionData: ', transactionData);
    return this.fw.createPayin(transactionData, req.user._id);
  }

  @Post('withdrawal')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  withdrawal(@Body() transactionData: any, @Req() req) {
    console.log('(fw controller) withdrawal: ', transactionData);
    return this.fw.withdrawal(transactionData, req.user._id);
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

  // init payout transaction
  @Get('payout/:transactionId')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createPayout(@Req() req, @Param('transactionId') transactionId) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.fw.payout(transactionId, req.user._id);
  }

  // init payout transaction
  @Get('retry-payout/:transactionId')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  retryPayout(@Req() req, @Param('transactionId') transactionId) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.fw.retryPayout(transactionId, req.user._id);
  }

  // Webhook: this route must be PUBLIC (override guard upstream if needed)
  @Post('webhook')
  @HttpCode(200) // FW attend 200 sinon il retente
  async handleWebhook(@Req() req: Request) {
    return this.fw.verifyWebhookPayin(req);
  }

  @Get('verify-payout/:id')
  verifyPayout(@Param('id') reference: string) {
    console.log('verifyPayout tx: ', reference);
    return this.fw.verifyPayout(reference);
  }

  @Get('payment-plans')
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  listPaymentPlans(@Query() query: ExpressQuery, @Req() req) {
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unautorised');
    // }
    // Supports optional pagination params: page, perPage
    return this.fw.getPaymentPlans({
      page: query?.page as any,
      perPage: query?.perPage as any,
    });
  }

  // Create a Flutterwave payment plan (subscription plan)
  @Post('payment-plans')
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  createPaymentPlan(@Body() planPayload: any, @Req() req) {
    console.log('Payload', planPayload);
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unautorised');
    // }
    return this.fw.createPaymentPlan(planPayload);
  }

  @Get('open-payin/:id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  openPayin(@Param('id') txRef: string, @Req() req) {
    return this.fw.openPayin(txRef, req.user._id);
  }

  @Post('create-virtual-card/:countryWallet')
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  createVirtualCard(@Body() cardPayload: Record<string, any>, @Req() req, @Param('countryWallet') countryWallet) {
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unautorised');
    // }
    return this.fw.createVirtualCard(countryWallet, cardPayload);
  }

  @Get('get-cards-list/:countryWallet')
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  getVirtualCardsList(@Req() req, @Param('countryWallet') countryWallet) {
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unautorised');
    // }
    return this.fw.getVirtualCards(countryWallet);
  }


  /// Test handling
  @Post('test-withdrawal')
  handleWithdrawal(@Body() transactionData: any) {
    console.log('(fw controller) withdrawal: ', transactionData);
    return this.fw.handleTestWithdrawal(transactionData);
  }
}
