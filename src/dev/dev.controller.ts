/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Controller,
  Get,
  Post,
  Req,
  ValidationPipe,
  UseGuards,
  UsePipes,
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

@ApiTags('dev')
@Controller('dev')
export class DevController {
  constructor(
    private devService: DevService,
    private userService: UserService,
    private transactionService: TransactionService,
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
      throw new NotFoundException('Unauthorised');
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
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials';
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
    description: 'Payout initiated.',
    schema: {
      example: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        status: 'payin_pending',
        data: {
          estimation: '5000',
          transactionRef: 'IN123#250101120000',
          invoiceTaxes: '250',
          paymentWithTaxes: '5250',
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
    const valid = await this.devService.authKey(userId, secretKey);
    if (!valid) return 'invalid credentials';
    return this.devService.createPayoutTransaction(data, userId);
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

}
