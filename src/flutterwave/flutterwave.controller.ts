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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('flutterwave')
@Controller('fw')
export class FlutterwaveController {
  constructor(private readonly fw: FlutterwaveService) {}

  @Get('balance/:countryWallet')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Flutterwave wallet balance by country wallet' })
  @ApiParam({ name: 'countryWallet', example: 'CM', description: 'Wallet country code (CM, NG, ...)' })
  @ApiResponse({ status: 200, description: 'Wallet balance returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  getBalance(@Param('countryWallet') countryWallet, @Req() req) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fw.getBalance(countryWallet);
  }

  @Get('payin-transactons/:countryWallet')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List Flutterwave payin transactions by wallet' })
  @ApiParam({ name: 'countryWallet', example: 'CM' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'successful' })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-01-31' })
  @ApiQuery({ name: 'periode', required: false, type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Payin transaction list returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  listPayinTransactions(
    @Query() query: ExpressQuery,
    @Param('countryWallet') countryWallet,
    @Req() req,
  ) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fw.listPayinTransactions(countryWallet, query);
  }

  @Get('payout-transactons/:countryWallet')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List Flutterwave payout transactions by wallet' })
  @ApiParam({ name: 'countryWallet', example: 'CM' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'SUCCESSFUL' })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-01-31' })
  @ApiQuery({ name: 'periode', required: false, type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Payout transaction list returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  listPayoutTransactions(
    @Param('countryWallet') countryWallet,
    @Query() query: ExpressQuery,
    @Req() req,
  ) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fw.listPayoutTransactions(countryWallet, query);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List generic Flutterwave transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'successful' })
  @ApiResponse({ status: 200, description: 'Transactions list returned.' })
  listTx(@Query('page') page?: number, @Query('status') status?: string) {
    return this.fw.listTransactions({ page, status });
  }

  @Post('payin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a payin session for a transaction' })
  @ApiBody({
    description: 'Transaction payload used to initialize payin.',
    schema: {
      example: {
        estimation: 1000,
        transactionRef: 'IN123#260305000100',
        senderEmail: 'sender@mail.com',
        senderName: 'John Doe',
        senderCurrency: 'XAF',
        receiverId: '65f0aa12d4b1c2f1a8a4f001',
        transactionType: 'transfer',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Payin initialized.' })
  @ApiResponse({ status: 400, description: 'Invalid payload.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createPayin(@Body() transactionData: any, @Req() req) {
    console.log('(fw controller) transactionData: ', transactionData);
    return this.fw.createPayin(transactionData, req.user._id);
  }

  @Post('withdrawal')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a withdrawal transaction from user balance' })
  @ApiBody({
    schema: {
      example: {
        estimation: 5000,
        paymentWithTaxes: 5250,
        senderCurrency: 'XAF',
        receiverCurrency: 'XAF',
        senderName: 'John Doe',
        receiverName: 'John Doe',
        bankCode: 'MTN',
        bankAccountNumber: '2376XXXXXXX',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Withdrawal initialized.' })
  @ApiResponse({ status: 400, description: 'Invalid payload or insufficient balance.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  withdrawal(@Body() transactionData: any, @Req() req) {
    console.log('(fw controller) withdrawal: ', transactionData);
    return this.fw.withdrawal(transactionData, req.user._id);
  }

  @Get('verify-payin/:txRef')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify a payin status by txRef' })
  @ApiParam({ name: 'txRef', example: 'txPayin-1741130000000-abcd1234' })
  @ApiResponse({ status: 200, description: 'Payin verification result.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 404, description: 'Payin not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  verify(@Param('txRef') txRef: string) {
    return this.fw.verifyPayin(txRef);
  }

  @Get('get-bank/:code')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get banks/operator list by country code' })
  @ApiParam({ name: 'code', example: 'CM', description: 'Country code' })
  @ApiResponse({ status: 200, description: 'Bank/operator list returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  getBanksList(@Param('code') countryCode: string) {
    return this.fw.getBanksList(countryCode);
  }

  // init payout transaction
  @Get('payout/:transactionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize payout for a successful payin transaction (admin only)' })
  @ApiParam({ name: 'transactionId', description: 'Internal transaction ID' })
  @ApiResponse({ status: 200, description: 'Payout initialized.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @ApiResponse({ status: 404, description: 'Transaction not found or invalid status.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createPayout(@Req() req, @Param('transactionId') transactionId) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fw.payout(transactionId, req.user._id);
  }

  // init payout transaction
  @Get('retry-payout/:transactionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry payout for a failed payout transaction (admin only)' })
  @ApiParam({ name: 'transactionId', description: 'Internal transaction ID' })
  @ApiResponse({ status: 200, description: 'Payout retried.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @ApiResponse({ status: 404, description: 'Transaction not found or not eligible for retry.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  retryPayout(@Req() req, @Param('transactionId') transactionId) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.fw.retryPayout(transactionId, req.user._id);
  }

  // Webhook: this route must be PUBLIC (override guard upstream if needed)
  @Post('webhook')
  @HttpCode(200) // FW attend 200 sinon il retente
  @ApiOperation({ summary: 'Flutterwave webhook endpoint' })
  @ApiBody({
    description: 'Webhook payload from Flutterwave.',
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @ApiResponse({ status: 200, description: 'Webhook received and processed.' })
  async handleWebhook(@Req() req: Request) {
    return this.fw.verifyWebhookPayin(req);
  }

  @Get('verify-payout/:id')
  @ApiOperation({ summary: 'Verify payout status by transfer reference/id' })
  @ApiParam({ name: 'id', description: 'Payout reference or txRef' })
  @ApiResponse({ status: 200, description: 'Payout verification result.' })
  @ApiResponse({ status: 404, description: 'Payout not found.' })
  verifyPayout(@Param('id') reference: string) {
    console.log('verifyPayout tx: ', reference);
    return this.fw.verifyPayout(reference);
  }

  @Get('payment-plans')
  @ApiOperation({ summary: 'List Flutterwave payment plans' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Payment plans returned.' })
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  listPaymentPlans(@Query() query: ExpressQuery, @Req() req) {
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unauthorised');
    // }
    // Supports optional pagination params: page, perPage
    return this.fw.getPaymentPlans({
      page: query?.page as any,
      perPage: query?.perPage as any,
    });
  }

  // Create a Flutterwave payment plan (subscription plan)
  @Post('payment-plans')
  @ApiOperation({ summary: 'Create a Flutterwave payment plan' })
  @ApiBody({
    schema: {
      example: {
        name: 'Premium Monthly',
        amount: 5000,
        interval: 'monthly',
        currency: 'XAF',
        duration: 12,
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Payment plan created.' })
  @ApiResponse({ status: 400, description: 'Invalid plan payload.' })
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  createPaymentPlan(@Body() planPayload: any, @Req() req) {
    console.log('Payload', planPayload);
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unauthorised');
    // }
    return this.fw.createPaymentPlan(planPayload);
  }

  @Get('open-payin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-open a payin if still eligible' })
  @ApiParam({ name: 'id', description: 'Payin txRef' })
  @ApiResponse({ status: 200, description: 'Payin reopened or status returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 404, description: 'Payin/transaction not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  openPayin(@Param('id') txRef: string, @Req() req) {
    return this.fw.openPayin(txRef, req.user._id);
  }

  @Post('create-virtual-card/:countryWallet')
  @ApiOperation({ summary: 'Create virtual card for a wallet country' })
  @ApiParam({ name: 'countryWallet', example: 'NG' })
  @ApiBody({
    schema: {
      example: {
        currency: 'USD',
        amount: 20,
        billing_name: 'John Doe',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Virtual card created.' })
  @ApiResponse({ status: 400, description: 'Invalid card payload.' })
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  createVirtualCard(@Body() cardPayload: Record<string, any>, @Req() req, @Param('countryWallet') countryWallet) {
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unauthorised');
    // }
    return this.fw.createVirtualCard(countryWallet, cardPayload);
  }

  @Get('get-cards-list/:countryWallet')
  @ApiOperation({ summary: 'Get virtual cards list by wallet country' })
  @ApiParam({ name: 'countryWallet', example: 'NG' })
  @ApiResponse({ status: 200, description: 'Virtual cards list returned.' })
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  getVirtualCardsList(@Req() req, @Param('countryWallet') countryWallet) {
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unauthorised');
    // }
    return this.fw.getVirtualCards(countryWallet);
  }


  /// Test handling
  @Post('test-withdrawal')
  @ApiOperation({ summary: 'Test withdrawal handling flow (internal)' })
  @ApiBody({
    schema: {
      example: {
        estimation: 1000,
        senderCurrency: 'XAF',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Test flow executed.' })
  handleWithdrawal(@Body() transactionData: any) {
    console.log('(fw controller) withdrawal: ', transactionData);
    return this.fw.handleTestWithdrawal(transactionData);
  }
}
