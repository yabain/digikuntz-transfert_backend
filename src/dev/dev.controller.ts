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
  @ApiResponse({ status: 200, description: 'Developer keys returned.' })
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
  @ApiResponse({ status: 200, description: 'Current user API keys returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyData(@Req() req): Promise<any> {
    return this.devService.getDevDataByUserId(req.user._id);
  }

  @Post('generate-key')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate API key pair for current user' })
  @ApiResponse({ status: 201, description: 'API keys generated.' })
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
  @ApiResponse({ status: 200, description: 'API keys reset.' })
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
  @ApiResponse({ status: 200, description: 'API status updated.' })
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
  @ApiResponse({ status: 200, description: 'Transaction API response returned.' })
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
  @ApiResponse({ status: 200, description: 'Paginated transactions list returned.' })
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
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Payin transaction initialized.' })
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

      status: 'transaction_payin_pending'
    }

    return this.devService.createPayinTransaction(transactionData, userId);
  }
  
  @Get('balance')
  @ApiOperation({ summary: 'Get user balance through API key headers' })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-secret-key', required: true })
  @ApiResponse({ status: 200, description: 'Balance returned.' })
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
