/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Controller,
  Get,
  Post,
  Req,
  ValidationPipe,
  UseGuards,
  UsePipes,ForbiddenException,
  NotFoundException,
  Param,
  Body,
  Put,
  Headers,
  Query,
} from '@nestjs/common';
import { Dev } from './dev.schema';
import { DevService } from './dev.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from 'src/user/user.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';

@ApiTags('dev')
@Controller('dev')
export class DevController {
  constructor(
    private devService: DevService,
    private userService: UserService,
    private transactionService: TransactionService,
    private idempotencyService: IdempotencyService,
  ) { }

  @Get('api-keys/:userId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get API keys of a user (admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Developer keys returned.',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        userId: '664f1a2b3c4d5e6f7a8b9c0e',
        status: true,
        secretKey: 'SK-1234567890-abcdef12',
        publicKey: 'PK-1234567890-abcdef12',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getDevDataByUserId(@Req() req, @Param('userId') userId): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.devService.getDevDataByUserId(userId);
  }

  @Get('my-key')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user API key pair' })
  @ApiResponse({
    status: 200,
    description: 'Current user API keys returned.',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        userId: '664f1a2b3c4d5e6f7a8b9c0e',
        status: true,
        secretKey: 'SK-1234567890-abcdef12',
        publicKey: 'PK-1234567890-abcdef12',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyData(@Req() req): Promise<any> {
    return this.devService.getDevDataByUserId(req.user._id);
  }

  @Post('generate-key')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate API key pair for current user' })
  @ApiResponse({
    status: 201,
    description: 'API keys generated.',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        userId: '664f1a2b3c4d5e6f7a8b9c0e',
        status: true,
        secretKey: 'SK-1234567890-abcdef12',
        publicKey: 'PK-1234567890-abcdef12',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async generateKey(
    @Req() req ): Promise<any> {
    return this.devService.createDevData(req.user._id);
  }

  @Put('reset-key')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset API key pair for current user' })
  @ApiResponse({
    status: 200,
    description: 'API keys reset.',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        userId: '664f1a2b3c4d5e6f7a8b9c0e',
        status: true,
        secretKey: 'SK-9999999999-newkey12',
        publicKey: 'PK-9999999999-newkey12',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async resetKey(@Req() req): Promise<any> {
    return this.devService.resetKey(req.user._id.toString());
  }

  @Put('update-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable/disable API access for current user' })
  @ApiBody({ schema: { example: { status: true } } })
  @ApiResponse({
    status: 200,
    description: 'API status updated.',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        userId: '664f1a2b3c4d5e6f7a8b9c0e',
        status: false,
        secretKey: 'SK-1234567890-abcdef12',
        publicKey: 'PK-1234567890-abcdef12',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateStatus(@Req() req, @Body() data): Promise<any> {
    return this.devService.updateStatus(String(req.user._id), data.status);
  }

  @Put('webhook-url')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user webhook URL for API transactions' })
  @ApiBody({ schema: { example: { webhookUrl: 'https://your-server.com/webhook' } } })
  @ApiResponse({
    status: 200,
    description: 'Webhook URL updated.',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        userId: '664f1a2b3c4d5e6f7a8b9c0e',
        status: true,
        webhookUrl: 'https://your-server.com/webhook',
        secretKey: 'SK-1234567890-abcdef12',
        publicKey: 'PK-1234567890-abcdef12',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid webhook URL.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateWebhookUrl(@Req() req, @Body() data): Promise<any> {
    return this.devService.updateWebhookUrl(
      String(req.user._id),
      data?.webhookUrl,
    );
  }

  @Get('transaction-by-ref')
  @ApiOperation({
    summary: 'Get API transaction data by its `transactionRef` (instead of Mongo _id)',
  })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiQuery({ name: 'transactionRef', required: true, type: String })
  @UsePipes(ValidationPipe)
  async getTransactionDataByRef(
    @Headers('x-user-id') userId: string,
    @Headers('x-secret-key') secretKey: string,
    @Query('transactionRef') transactionRef: string,
  ): Promise<any> {
    if (!secretKey) throw new NotFoundException('secretKey is required');
    if (!userId) throw new NotFoundException('userId is required');
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials or invalid user status or API access desabled';
    if (!transactionRef) throw new NotFoundException('transactionRef is required');
    return this.devService.getTransactionDataByRef(transactionRef, userId);
  }

  @Get('transaction')
  @ApiOperation({ summary: 'Get API transaction data with key headers' })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiQuery({ name: 'transactionId', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Transaction API response returned.',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        status: 'payin_pending',
        data: {
          estimation: '10000',
          transactionRef: 'IN123#250101120000',
          invoiceTaxes: '500',
          paymentWithTaxes: '10500',
          raisonForTransfer: 'Test payment',
          receiverCurrency: 'XAF',
          transactionType: 'apiCall',
          paymentLink: 'https://checkout.flutterwave.com/v3/hosted/pay/xxxxx',
          createdAt: '2025-01-01T12:00:00.000Z',
          updatedAt: '2025-01-01T12:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Missing/invalid headers or transaction not found.' })
  @UsePipes(ValidationPipe)
  async getTransactionData(
    @Headers('x-user-id') userId: string,
    @Headers('x-secret-key') secretKey: string,
    @Query('transactionId') transactionId: string,
  ): Promise<any> {
    if (!secretKey) {
      throw new NotFoundException('secretKey is required');
    }
    if (!userId) {
      throw new NotFoundException('userId is required');
    }
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials or invalid user status or API access desabled';
    if (!transactionId) {
      throw new NotFoundException('transactionId is required');
    }
    return this.devService.getTransactionData(transactionId, userId);
  }

  @Get('transactions-list')
  @ApiOperation({ summary: 'Get paginated API transactions list with key headers' })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Paginated transactions list returned.',
    schema: {
      example: {
        data: [
          {
            _id: '664f1a2b3c4d5e6f7a8b9c0d',
            status: 'transaction_payin_pending',
            transactionType: 'apiCall',
            estimation: '10000',
            transactionRef: 'IN123#250101120000',
            receiverCurrency: 'XAF',
            createdAt: '2025-01-01T12:00:00.000Z',
            updatedAt: '2025-01-01T12:00:00.000Z',
          },
        ],
        pagination: {
          currentPage: 1,
          limit: 10,
          totalPages: 3,
          totalItems: 25,
          hasNextPage: true,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Missing/invalid credentials.' })
  @UsePipes(ValidationPipe)
  async getTransactions(
    @Headers('x-user-id') userId: string,
    @Headers('x-secret-key') secretKey: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<any> {
    if (!secretKey) {
      throw new NotFoundException('secretKey is required');
    }
    if (!userId) {
      throw new NotFoundException('userId is required');
    }
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials or invalid user status or API access desabled';

    return this.devService.getTransactions(userId, { page, limit });
  }

  @Post('transaction')
  @ApiOperation({ summary: 'Create payin transaction through API key flow' })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiBody({
    schema: {
      example: {
        estimation: 100,
        raisonForTransfer: 'Test',
        userEmail: 'email@example.com',
        userPhone: '691224472',
        userCountry: 'Cameroon',
        senderName: 'Junior',
        callbackUrl: 'https://your-server.com/webhook',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Payin transaction initialized.',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        status: 'payin_pending',
        data: {
          estimation: '10000',
          transactionRef: 'IN123#250101120000',
          invoiceTaxes: '500',
          paymentWithTaxes: '10500',
          raisonForTransfer: 'Test payment',
          receiverCurrency: 'XAF',
          transactionType: 'apiCall',
          paymentLink: 'https://checkout.flutterwave.com/v3/hosted/pay/xxxxx',
          createdAt: '2025-01-01T12:00:00.000Z',
          updatedAt: '2025-01-01T12:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid payload.' })
  @UsePipes(ValidationPipe)
  async createPayinTransaction(
    @Headers('x-user-id') userId: string,
    @Headers('x-secret-key') secretKey: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() data: {
      estimation: number,
      raisonForTransfer: string,
      userEmail: string,
      userPhone: string,
      userCountry: string,
      senderName: string,
      callbackUrl?: string,
    },
  ): Promise<any> {
    if (!secretKey) {
      throw new NotFoundException('secretKey is required');
    }
    if (!userId) {
      throw new NotFoundException('userId is required');
    }
    // Authenticate before the idempotency scope: the scope must be a verified userId.
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials';
    return this.idempotencyService.processKey(idempotencyKey, async () => {
      const userData = await this.userService.getUserById(userId);
      if (!userData) return 'user not found';
      const transactionData = {
        transactionRef: this.transactionService.generateInRef(),
        estimation: data.estimation,
        transactionType: 'apiCall',
        receiverId: userData._id.toString(),
        raisonForTransfer: data.raisonForTransfer,

        senderId: userData._id.toString(),
        senderName: 'API Call: ' + data.senderName,
        senderEmail: data.userEmail,
        senderContact: data.userPhone,
        senderCountry: data.userCountry,
        senderCurrency: userData.countryId.currency,

        receiverName: this.userService.showName(userData),
        receiverEmail: userData.email,
        receiverContact: userData.phone,
        receiverCountry: userData.countryId.name,
        receiverCurrency: userData.countryId.currency,

        status: 'transaction_payin_pending',
        ...(data.callbackUrl && { callbackUrl: data.callbackUrl }),
      }

      return this.devService.createPayinTransaction(transactionData, userId);
    }, `${userId}:transaction`);
  }

  @Post('direct-charge')
  @ApiOperation({ summary: 'Initiate a direct mobile money charge via API key (no hosted checkout)' })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiBody({
    schema: {
      example: {
        estimation: 100,
        currency: 'XAF',
        userPhone: '237650123456',
        userEmail: 'payer@example.com',
        userCountry: 'Cameroon',
        senderName: 'John Doe',
        callbackUrl: 'https://your-site.com/return',
        raisonForTransfer: 'Order payment',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Direct charge initiated (payin_pending). If Flutterwave refused the direct charge, data also carries chargeStatus "failed" and a hosted paymentLink.',
    schema: {
      example: {
        id: '6af3b70df7bdee716adaa851',
        status: 'payin_pending',
        data: {
          estimation: '100',
          transactionRef: 'IN535#261111013004',
          invoiceTaxes: '5',
          paymentWithTaxes: '105',
          transactionType: 'apiCall',
          appliedFeeRate: 5,
          currency: 'XAF',
          paymentMethodCode: 'MTN',
          txRef: 'txDirect-1794357004563-22155c1b',
          createdAt: '2026-11-11T00:30:05.115Z',
          updatedAt: '2026-11-11T00:30:05.115Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid payload.' })
  @ApiResponse({ status: 404, description: 'Missing/invalid credentials.' })
  @UsePipes(ValidationPipe)
  async createDirectCharge(
    @Headers('x-user-id') userId: string,
    @Headers('x-secret-key') secretKey: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() data: {
      estimation: number;
      currency: string;
      phone: string;
      email: string;
      name?: string;
      network?: string;
      paymentMethodCode?: string;
      callbackUrl?: string;
    },
  ): Promise<any> {
    if (!secretKey) throw new NotFoundException('secretKey is required');
    if (!userId) throw new NotFoundException('userId is required');
    // Authenticate before the idempotency scope: the scope must be a verified userId.
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials';
    return this.idempotencyService.processKey(idempotencyKey, async () => {
      const userData = await this.userService.getUserById(userId);
      if (!userData) return 'user not found';

      return this.devService.createDirectPayinTransaction(
        {
          ...data,
          country: userData.countryId?.name || '',
        },
        userId,
      );
    }, `${userId}:direct-charge`, { preserveReservationOnFailure: true });
  }

  @Post('payout')
  @ApiOperation({ summary: 'Initiate a payout from account balance via API key' })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiBody({
    schema: {
      example: {
        amount: 5000,
        accountBankCode: 'MTN',
        accountNumber: '237691224472',
        receiverName: 'John Doe',
        currency: 'XAF',
        narration: 'Paiement fournisseur',
        callbackUrl: 'https://your-server.com/webhook',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Payout initiated (pending admin validation).',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        status: 'payout_pending',
        data: {
          estimation: '5000',
          transactionRef: 'IN598#260618164000',
          invoiceTaxes: '0',
          paymentWithTaxes: '5000',
          raisonForTransfer: 'Paiement fournisseur',
          receiverCurrency: 'XAF',
          transactionType: 'apiCall',
          createdAt: '2025-01-01T12:00:00.000Z',
          updatedAt: '2025-01-01T12:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid payload.' })
  @ApiResponse({ status: 404, description: 'Missing/invalid credentials.' })
  @UsePipes(ValidationPipe)
  async createPayoutTransaction(
    @Headers('x-user-id') userId: string,
    @Headers('x-secret-key') secretKey: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() data: {
      amount: number;
      accountBankCode: string;
      accountNumber: string;
      receiverName: string;
      currency: string;
      narration?: string;
      callbackUrl?: string;
    },
  ): Promise<any> {
    if (!secretKey) throw new NotFoundException('secretKey is required');
    if (!userId) throw new NotFoundException('userId is required');
    // Authenticate before the idempotency scope: the scope must be a verified userId.
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials';
    return this.idempotencyService.processKey(
      idempotencyKey,
      async () => this.devService.createPayoutTransaction(data, userId),
      `${userId}:payout`,
      { preserveReservationOnFailure: true },
    );
  }

  @Get('api-transactions')
  @ApiOperation({ summary: 'Get paginated API transactions (apiCall) with filters' })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'startDate', required: false, type: String, example: '2025-01-01' })
  @ApiQuery({ name: 'endDate', required: false, type: String, example: '2025-12-31' })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'payin_success', description: 'Filter by simplified status (payin_pending, payin_success, payin_error, payin_closed, payout_pending, payout_success, payout_error, payout_closed, payout_rejected)' })
  @ApiQuery({ name: 'type', required: false, type: String, example: 'payin', description: 'Filter by transaction type: payin or payout' })
  @ApiResponse({
    status: 200,
    description: 'Paginated API transactions list returned.',
    schema: {
      example: {
        data: [
          {
            _id: '664f1a2b3c4d5e6f7a8b9c0d',
            transactionType: 'apiCall',
            status: 'transaction_payin_success',
            estimation: '10000',
            transactionRef: 'IN123#250101120000',
            receiverCurrency: 'XAF',
            createdAt: '2025-01-01T12:00:00.000Z',
            updatedAt: '2025-01-01T12:00:00.000Z',
          },
        ],
        pagination: {
          currentPage: 1,
          limit: 10,
          totalPages: 3,
          totalItems: 25,
          hasNextPage: true,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Missing/invalid credentials.' })
  @UsePipes(ValidationPipe)
  async getApiTransactions(
    @Headers('x-user-id') userId: string,
    @Headers('x-secret-key') secretKey: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ): Promise<any> {
    if (!secretKey) throw new NotFoundException('secretKey is required');
    if (!userId) throw new NotFoundException('userId is required');
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials';
    return this.devService.getApiTransactions(userId, { page, limit, startDate, endDate, status, type });
  }

  @Get('api-payouts')
  @ApiOperation({ summary: 'Get paginated API payout transactions list (apiCall payouts only)' })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'startDate', required: false, type: String, example: '2025-01-01' })
  @ApiQuery({ name: 'endDate', required: false, type: String, example: '2025-12-31' })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'payout_pending', description: 'Filter by simplified payout status' })
  @ApiResponse({
    status: 200,
    description: 'Paginated API payout transactions list returned.',
    schema: {
      example: {
        data: [
          {
            _id: '664f1a2b3c4d5e6f7a8b9c0d',
            transactionType: 'apiCall',
            isApiPayout: true,
            status: 'transaction_payout_pending',
            estimation: '5000',
            transactionRef: 'IN598#260618164000',
            receiverCurrency: 'XAF',
            createdAt: '2025-01-01T12:00:00.000Z',
            updatedAt: '2025-01-01T12:00:00.000Z',
          },
        ],
        pagination: {
          currentPage: 1,
          limit: 10,
          totalPages: 2,
          totalItems: 15,
          hasNextPage: true,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Missing/invalid credentials.' })
  @UsePipes(ValidationPipe)
  async getApiPayouts(
    @Headers('x-user-id') userId: string,
    @Headers('x-secret-key') secretKey: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
  ): Promise<any> {
    if (!secretKey) throw new NotFoundException('secretKey is required');
    if (!userId) throw new NotFoundException('userId is required');
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials';
    return this.devService.getApiPayouts(userId, { page, limit, startDate, endDate, status });
  }

  @Get('balance')
  @ApiOperation({ summary: 'Get user balance through API key headers' })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiResponse({
    status: 200,
    description: 'Balance returned.',
    schema: {
      example: {
        balance: 25000,
        currency: 'XAF',
        lastUpdate: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Missing/invalid credentials.' })
  async getUserBalance(
    @Headers('x-user-id') userId: string,
    @Headers('x-secret-key') secretKey: string,
  ): Promise<any> {
    if (!secretKey) {
      throw new NotFoundException('secretKey is required');
    }
    if (!userId) {
      throw new NotFoundException('userId is required');
    }
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials or invalid user status or API access desabled or Unauthorize';
    return this.devService.getUserBalance(userId);
  }

  @Get('auto-approve')
  @ApiOperation({ summary: 'Get auto-approve cron toggle state' })
  async getAutoApprove(): Promise<any> {
    return { enabled: this.devService.getAutoApproveState() };
  }

  @Put('auto-approve')
  @ApiOperation({ summary: 'Toggle auto-approve cron (admin/API)' })
  @ApiBody({ schema: { example: { enabled: true } } })
  async setAutoApprove(@Body() body: { enabled: boolean }): Promise<any> {
    return { enabled: this.devService.setAutoApproveState(body.enabled) };
  }

    @Get('api-doc')
  @ApiOperation({ summary: 'Public structured API documentation (English, no auth)' })
  @ApiResponse({ status: 200, description: 'Structured JSON documentation.' })
async getApiDoc(): Promise<any> {
    return {
      documentation: 'digiKUNTZ Payments API',
      language: 'en',
      baseUrl: 'https://app.digikuntz.com/dev',
      version: 'v1',
      sections: [
        { id: 'intro', title: 'Introduction', description: 'RESTful API for payments, payouts, balance checks, transaction history.', steps: ['Create account.', 'Complete verification.', 'Generate API key via /dev/generate-key.'] },
        { id: 'api-keys', title: 'API Keys', description: 'Manage dev credentials.', endpoints: [{ method: 'GET', path: '/dev/my-key', auth: 'Bearer JWT', description: 'Retrieve API key.', request: { headers: { Authorization: 'Bearer <jwt_token>' } }, responseExample: { id: '664f1a2b3c4d5e6f7a8b9c0d', userId: '664f1a2b3c4d5e6f7a8b9c0e', status: true, webhookUrl: 'https://your-server.com/webhook', publicKey: 'PK-1234567890-abcdef12', secretKey: 'SK-1234567890-abcdef12' } }, { method: 'POST', path: '/dev/generate-key', auth: 'Bearer JWT', description: 'Generate new key.', request: {}, responseExample: { id: '664f1a2b3c4d5e6f7a8b9c0d', userId: '664f1a2b3c4d5e6f7a8b9c0e', status: true, webhookUrl: '', publicKey: 'PK-1234567890-abcdef12', secretKey: 'SK-1234567890-abcdef12' } }] },
        { id: 'transactions', title: 'Transactions', description: 'Initiate and retrieve payments.', endpoints: [{ method: 'POST', path: '/dev/transaction', auth: 'Headers x-user-id + x-secret-key', description: 'Initiate direct payment.', request: { headers: { 'x-user-id': 'string', 'x-secret-key': 'string' }, body: { estimation: 100, raisonForTransfer: 'Paiement fournisseur', userEmail: 'email@example.com', userPhone: '691224472', userCountry: 'Cameroon', senderName: 'Kevin', callbackUrl: 'https://your-site.com/payment-return' } }, responseExample: { id: '664f1a2b3c4d5e6f7a8b9c0d', status: 'payin_pending', data: { estimation: '100', transactionRef: 'IN123#250101120000', invoiceTaxes: '5', paymentWithTaxes: '105', raisonForTransfer: 'Paiement fournisseur', receiverCurrency: 'XAF', transactionType: 'apiCall', paymentLink: 'https://checkout.flutterwave.com/v3/hosted/pay/xxxxx', createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' } } }, { method: 'GET', path: '/dev/transaction?transactionId=<id>', auth: 'Headers x-user-id + x-secret-key', description: 'Get by MongoDB _id. After a direct-charge refusal fallback, while status is payin_pending, data.paymentLink holds the hosted checkout URL.', request: { query: { transactionId: '664f1a2b3c4d5e6f7a8b9c0d' }, headers: { 'x-user-id': 'string', 'x-secret-key': 'string' } }, responseExample: { id: '664f1a2b3c4d5e6f7a8b9c0d', status: 'payin_success', data: { estimation: '100', transactionRef: 'IN123#250101120000', invoiceTaxes: '5', paymentWithTaxes: '105', raisonForTransfer: 'Paiement fournisseur', receiverCurrency: 'XAF', transactionType: 'apiCall', createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' } } }, { method: 'GET', path: '/dev/transactions-list?page=1&limit=20', auth: 'Headers x-user-id + x-secret-key', description: 'Paginated list.', request: { query: { page: 1, limit: 20 }, headers: { 'x-user-id': 'string', 'x-secret-key': 'string' } }, responseExample: { data: [{ _id: 'id', estimation: '25', transactionRef: 'IN231#260205190756', status: 'transaction_payin_error', transactionType: 'apiCall', createdAt: '2026-02-05T19:07:56.148Z', updatedAt: '2026-02-06T03:08:00.164Z' }], pagination: { currentPage: 1, limit: 20, totalPages: 3, totalItems: 52, hasNextPage: true } } }] },
        { id: 'direct-charge', title: 'Direct Charge', description: 'Charge a customer mobile-money account directly from your server, without redirecting the customer to a hosted checkout page. The payin is created as payin_pending; confirm the final outcome with GET /dev/transaction?transactionId=<id> or the webhook.', endpoints: [{ method: 'POST', path: '/dev/direct-charge', auth: 'Headers x-user-id + x-secret-key', description: 'Direct mobile-money charge. The payment method is selected from the currency and the operator of userPhone unless paymentMethodCode is given.', routing: 'Without paymentMethodCode the API selects the ACTIVE payin payment method whose currency matches currency, whose gateway is Flutterwave and whose code matches the operator of userPhone: Orange CM (655-659, 686-689, 690-699) -> ORANGEMONEY, MTN CM (650-654, 670-679, 680-685) -> MTN. No match -> 400 NO_ACTIVE_PAYIN_METHOD. paymentMethodCode is an optional explicit override, validated against currency and availability. The network field is ignored.', request: { headers: { 'x-user-id': 'string', 'x-secret-key': 'string' }, body: { estimation: 100, currency: 'XAF', userPhone: '237650123456', userEmail: 'payer@example.com', userCountry: 'Cameroon', senderName: 'John Doe', callbackUrl: 'https://your-site.com/return', raisonForTransfer: 'Order payment' } }, responseExample: { id: '6af3b70df7bdee716adaa851', status: 'payin_pending', data: { estimation: '100', transactionRef: 'IN535#261111013004', invoiceTaxes: '5', paymentWithTaxes: '105', transactionType: 'apiCall', appliedFeeRate: 5, currency: 'XAF', paymentMethodCode: 'MTN', txRef: 'txDirect-1794357004563-22155c1b', createdAt: '2026-11-11T00:30:05.115Z', updatedAt: '2026-11-11T00:30:05.115Z' } }, responseWhenRefused: { id: '6af3b037d39740d6da4a0ce4', status: 'payin_pending', data: { estimation: '100', transactionRef: 'IN401#261111010055', invoiceTaxes: '5', paymentWithTaxes: '105', transactionType: 'apiCall', appliedFeeRate: 5, currency: 'XAF', paymentMethodCode: 'ORANGEMONEY', txRef: 'txPayin-1794355268504-3258c0a6', paymentLink: 'https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-XXXX', redirect_url: 'https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-XXXX', chargeStatus: 'failed', fallback: { from: 'direct', reason: 'DIRECT_CHARGE_REFUSED', message: 'The direct mobile money charge was refused; a hosted checkout link was created instead.', directTxRef: 'txDirect-1794355255187-9014209c' }, directCharge: { source: 'flutterwave', message: 'Transaction Failed', upstreamStatus: 400 } } }, errors: [{ code: 'NO_ACTIVE_PAYIN_METHOD', status: 400, meaning: 'No active Flutterwave payin method matches the currency and the operator of userPhone.' }, { code: 'INVALID_PHONE', status: 400, meaning: 'userPhone is not a valid phone number.' }, { code: 'NETWORK_NOT_RESOLVED', status: 400, meaning: 'The mobile-money operator cannot be resolved from userPhone.' }, { code: 'AMBIGUOUS_NUMBER', status: 400, meaning: 'userPhone cannot be mapped unambiguously to one operator.' }, { code: 'AMOUNT_BELOW_MIN', status: 400, meaning: 'estimation is below the minimum for the selected method.' }, { code: 'AMOUNT_EXCEEDS_MAX', status: 400, meaning: 'estimation is above the maximum for the selected method.' }, { code: 'LIMIT_EXCEEDED', status: 400, meaning: 'The transaction would exceed the account limit.' }, { code: 'METHOD_NOT_FOUND', status: 404, meaning: 'Explicit paymentMethodCode does not exist. Only when paymentMethodCode is given.' }, { code: 'CURRENCY_MISMATCH', status: 400, meaning: 'Explicit paymentMethodCode does not support the given currency. Only when paymentMethodCode is given.' }, { code: 'METHOD_DISABLED', status: 400, meaning: 'Explicit paymentMethodCode is not enabled for payin. Only when paymentMethodCode is given.' }, { code: 'n/a', status: 502, meaning: 'Upstream 5xx or timeout: the outcome is unknown. No link is returned and the payin stays pending for reconciliation. Check GET /dev/transaction?transactionId=<id> before any retry.' }, { code: 'DIRECT_CHARGE_DISABLED', status: 503, meaning: 'Direct mobile-money charges are currently switched off.' }] }, { method: 'POST', path: '/fw/direct-charge', auth: 'Bearer JWT', description: 'Direct charge via Flutterwave gateway.', request: { headers: { Authorization: 'Bearer <jwt_token>' }, body: { estimation: 5000, userPhone: '237691224472', userEmail: 'payer@example.com', userCountry: 'Cameroon', senderName: 'John Doe', paymentMethodCode: 'MTN', callbackUrl: 'https://your-site.com/return', raisonForTransfer: 'Order payment' } }, responseExample: { id: '664f1a2b3c4d5e6f7a8b9c0d', status: 'payin_pending', data: { estimation: '5000', transactionRef: 'IN123#250101120000', invoiceTaxes: '250', paymentWithTaxes: '5250', appliedFeeRate: '5', raisonForTransfer: 'Order payment', receiverCurrency: 'XAF', transactionType: 'apiCall' } } }] },
        { id: 'payout', title: 'Payout', endpoints: [{ method: 'POST', path: '/dev/payout', auth: 'Headers x-user-id + x-secret-key', description: 'Initiate payout.', request: { headers: { 'x-user-id': 'string', 'x-secret-key': 'string' }, body: { amount: 5000, accountBankCode: 'MTN', accountNumber: '237691224472', receiverName: 'John Doe', currency: 'XAF', narration: 'Paiement fournisseur' } }, responseExample: { id: '664f1a2b3c4d5e6f7a8b9c0d', status: 'payout_pending', data: { estimation: '5000', transactionRef: 'IN123#250101120000', invoiceTaxes: '0', paymentWithTaxes: '5000', raisonForTransfer: 'Paiement fournisseur', receiverCurrency: 'XAF', transactionType: 'apiCall', createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' } } }, { method: 'GET', path: '/dev/api-payouts?page=1&limit=10&startDate=&endDate=&status=', auth: 'Headers x-user-id + x-secret-key', description: 'Paginated payouts.', responseExample: { data: [{ _id: '664f1a2b3c4d5e6f7a8b9c0d', transactionType: 'apiCall', isApiPayout: true, status: 'transaction_payout_pending', estimation: '5000', transactionRef: 'IN598#260618164000', receiverCurrency: 'XAF', createdAt: '2026-01-01T12:00:00.000Z' }], pagination: { currentPage: 1, limit: 10, totalPages: 2, totalItems: 15, hasNextPage: true } } }] },
        { id: 'balance', title: 'Balance', endpoints: [{ method: 'GET', path: '/dev/balance', auth: 'Headers x-user-id + x-secret-key', description: 'Check balance.', request: { headers: { 'x-user-id': 'string', 'x-secret-key': 'string' } }, responseExample: { balance: 85000, currency: 'XAF', lastUpdate: '2026-01-26T22:54:30.219Z' } }] },
        { id: 'webhook', title: 'Webhook', description: 'Configurable webhook URL.', payloadExample: { id: '664f1a2b3c4d5e6f7a8b9c0d', status: 'payin_success', data: { estimation: '5000', transactionRef: 'IN123#250101120000', invoiceTaxes: '250', paymentWithTaxes: '5250', raisonForTransfer: 'Paiement fournisseur', receiverCurrency: 'XAF', transactionType: 'apiCall', createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' } }, possibleStatuses: { payin: ['payin_pending', 'payin_success', 'payin_error', 'payin_closed'], payout: ['payout_pending', 'payout_success', 'payout_error', 'payout_closed', 'payout_rejected'] } },
        { id: 'history', title: 'History', endpoints: [{ method: 'GET', path: '/dev/api-transactions?page=1&limit=10&startDate=&endDate=&status=&type=', auth: 'Headers x-user-id + x-secret-key', description: 'List transactions.', request: { query: { page: 1, limit: 10 }, headers: { 'x-user-id': 'string', 'x-secret-key': 'string' } }, responseExample: { data: [{ _id: '664f1a2b3c4d5e6f7a8b9c0d', transactionType: 'apiCall', status: 'transaction_payin_success', estimation: '10000', transactionRef: 'IN123#250101120000', receiverCurrency: 'XAF', createdAt: '2026-01-01T12:00:00.000Z' }], pagination: { currentPage: 1, limit: 10, totalPages: 3, totalItems: 25, hasNextPage: true } } }, { method: 'GET', path: '/dev/transaction?transactionId=<id>', auth: 'Headers x-user-id + x-secret-key', description: 'By MongoDB _id.', responseExample: { id: '664f1a2b3c4d5e6f7a8b9c0d', status: 'payin_success', data: { estimation: '100', transactionRef: 'IN123#250101120000', invoiceTaxes: '5', paymentWithTaxes: '105', raisonForTransfer: 'Paiement fournisseur', receiverCurrency: 'XAF', transactionType: 'apiCall', createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' } } }, { method: 'GET', path: '/dev/transaction-by-ref?transactionRef=<ref>', auth: 'Headers x-user-id + x-secret-key', description: 'By stable ref.', responseExample: { id: '664f1a2b3c4d5e6f7a8b9c0d', status: 'payin_success', data: { estimation: '100', transactionRef: 'IN123#250101120000' } } }] },
      ],
      notes: 'Public endpoint — no authentication required. All /dev/ operations require x-user-id and x-secret-key headers (retrieve via /dev/my-key with Bearer JWT). Idempotency-Key (header, optional, string up to 255 chars) ensures POST /dev/transaction, /dev/direct-charge and /dev/payout execute at most once per user per route: a retry with the same Idempotency-Key returns the stored response. If a server-side failure occurs after a side effect (charge or debit), a retry returns 409 Request with this Idempotency-Key is still in progress (blocked until the 24h TTL expires). Direct-charge: if Flutterwave refuses the mobile-money charge immediately, POST /dev/direct-charge still returns 201 with status payin_pending, chargeStatus "failed" and a hosted checkout link (data.paymentLink / redirect_url, fallback.reason DIRECT_CHARGE_REFUSED). An ambiguous outcome (upstream 5xx or timeout) returns 502 with no link: the payin stays pending for reconciliation, so check GET /dev/transaction?transactionId=<id> before any retry.',
    };
  }

}
