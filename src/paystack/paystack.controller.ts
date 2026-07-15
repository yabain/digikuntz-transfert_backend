import {
  Controller,
  Get,ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaystackService } from './paystack.service';
import { InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import { Response } from 'express';
import { Gateway } from 'src/gateway/gateway.schema';
import { CryptService } from 'src/dev/crypt.service';
import { Payin, PayinStatus } from 'src/payin/payin.schema';

@ApiTags('paystack')
@Controller('paystack')
export class PaystackController {
  constructor(
    private readonly paystackService: PaystackService,
    private readonly cryptService: CryptService,
    @InjectModel(Gateway.name) private readonly gatewayModel: mongoose.Model<Gateway>,
    @InjectModel(Payin.name) private readonly payinModel: mongoose.Model<Payin>,
  ) {}

  private async loadCredentials(gatewayId?: string): Promise<void> {
    let gateway;
    if (gatewayId) {
      gateway = await this.gatewayModel.findById(gatewayId).exec();
    } else {
      gateway = await this.gatewayModel.findOne({ type: 'paystack', isActive: true }).exec();
    }
    if (!gateway) throw new NotFoundException('Active Paystack gateway not found');

    let creds: Record<string, any> = {};
    try {
      const decrypted = this.cryptService.decryptWithPassphrase(gateway.credentials);
      creds = JSON.parse(decrypted);
    } catch { creds = {}; }

    this.paystackService.setCredentials(creds);
  }

  @Get('payin-callback')
  @ApiOperation({ summary: 'Paystack payin redirect callback (public)' })
  @ApiQuery({ name: 'txRef', required: true, description: 'Local transaction reference' })
  @ApiQuery({ name: 'reference', required: false, description: 'Paystack reference' })
  @ApiQuery({ name: 'trxref', required: false, description: 'Paystack trxref' })
  async handlePayinCallback(
    @Query('txRef') txRef: string,
    @Query('reference') reference: string,
    @Query('trxref') trxref: string,
    @Res() res: Response,
  ) {
    const frontUrl = process.env.FRONT_URL || 'https://payments.digikuntz.com';
    if (!txRef) {
      return res.redirect(`${frontUrl}/dashboard`);
    }

    const paystackRef = reference || trxref;
    if (!paystackRef) {
      return res.redirect(`${frontUrl}/dashboard`);
    }

    try {
      await this.loadCredentials();
      const verifyResp = await this.paystackService.verifyTransaction(paystackRef);
      const paystackStatus = String(verifyResp?.data?.status || '').toLowerCase();

      let newStatus = PayinStatus.PENDING;
      if (paystackStatus === 'success') newStatus = PayinStatus.SUCCESSFUL;
      else if (paystackStatus === 'failed') newStatus = PayinStatus.FAILED;
      else if (paystackStatus === 'abandoned') newStatus = PayinStatus.CANCELLED;

      await this.payinModel.findOneAndUpdate({ txRef }, { status: newStatus }).exec();
    } catch (e: any) {
      // Silently ignore - user will see pending status and can retry
    }

    return res.redirect(`${frontUrl}/dashboard`);
  }

  @Get('balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Paystack balance (KES/M-Pesa context)' })
  @ApiQuery({ name: 'gatewayId', required: false, description: 'Optional gateway ID to use specific credentials' })
  @ApiResponse({ status: 200, description: 'Balance returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getBalance(@Req() req, @Query('gatewayId') gatewayId?: string) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    await this.loadCredentials(gatewayId);
    return this.paystackService.getBalance();
  }

  @Get('payin-transactions')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'List Paystack payin transactions (default: page=1, limit=10, newest first)',
  })
  @ApiQuery({ name: 'gatewayId', required: false, description: 'Optional gateway ID to use specific credentials' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'success' })
  @ApiQuery({ name: 'currency', required: false, type: String, example: 'KES' })
  @ApiQuery({ name: 'reference', required: false, type: String, example: 'txPayin-1773009446520-a49201e1' })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-03-01' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-03-31' })
  @ApiResponse({ status: 200, description: 'Payin transactions returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async listPayinTransactions(@Req() req, @Query() query: any, @Query('gatewayId') gatewayId?: string) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    await this.loadCredentials(gatewayId);
    return this.paystackService.listPayinTransactions(query);
  }

  @Get('payout-transactions')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'List Paystack payout transactions (default: page=1, limit=10, newest first)',
  })
  @ApiQuery({ name: 'gatewayId', required: false, description: 'Optional gateway ID to use specific credentials' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'success' })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-03-01' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-03-31' })
  @ApiResponse({ status: 200, description: 'Payout transactions returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async listPayoutTransactions(@Req() req, @Query() query: any, @Query('gatewayId') gatewayId?: string) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    await this.loadCredentials(gatewayId);
    return this.paystackService.listPayoutTransactions(query);
  }

  @Post('transfers/disable-otp/:otp')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Disable Paystack transfer OTP by finalizing with the PIN/OTP code',
  })
  @ApiResponse({
    status: 200,
    description: 'Transfer OTP disabled successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  disableTransferOtp(@Req() req, @Param('otp') otp: string) {
    // if (!req.user.isAdmin) {
    //   throw new ForbiddenException('Unauthorised');
    // }
    return this.paystackService.disableTransferOtpWithPin(otp);
  }
}
