import {
  Body,
  Controller,
  Get,
  HttpStatus,ForbiddenException,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import { MpesaService } from './mpesa.service';
import { Payin, PayinDocument, PayinProvider } from 'src/payin/payin.schema';
import { Payout, PayoutDocument, PayoutProvider } from 'src/payout/payout.schema';
import { Gateway, MpesaBalances } from 'src/gateway/gateway.schema';
import { CryptService } from 'src/dev/crypt.service';

@ApiTags('mpesa')
@Controller('mpesa')
export class MpesaController {
  constructor(
    private readonly mpesaService: MpesaService,
    private readonly cryptService: CryptService,
    @InjectModel(Payin.name) private readonly payinModel: mongoose.Model<PayinDocument>,
    @InjectModel(Payout.name) private readonly payoutModel: mongoose.Model<PayoutDocument>,
    @InjectModel(Gateway.name) private readonly gatewayModel: mongoose.Model<Gateway>,
  ) {}

  private buildDateFilter(from?: string, to?: string) {
    const createdAt: Record<string, Date> = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) createdAt.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) createdAt.$lte = d;
    }
    return Object.keys(createdAt).length ? { createdAt } : {};
  }

  private async listIncoming(
    page?: number,
    limit?: number,
    from?: string,
    to?: string,
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;
    const dateFilter = this.buildDateFilter(from, to);

    const [data, total] = await Promise.all([
      this.payinModel
        .find({ provider: PayinProvider.MPESA, ...dateFilter })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.payinModel.countDocuments({
        provider: PayinProvider.MPESA,
        ...dateFilter,
      }),
    ]);

    return {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
      data,
    };
  }

  private async listOutgoing(
    page?: number,
    limit?: number,
    from?: string,
    to?: string,
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;
    const dateFilter = this.buildDateFilter(from, to);

    const [data, total] = await Promise.all([
      this.payoutModel
        .find({ provider: PayoutProvider.MPESA, ...dateFilter })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.payoutModel.countDocuments({
        provider: PayoutProvider.MPESA,
        ...dateFilter,
      }),
    ]);

    console.log('data: ', data);
    return {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
      data,
    };
  }

  private parseMpesaBalance(balanceStr: string): MpesaBalances {
    const balances: MpesaBalances = {};
    if (!balanceStr) return balances;

    const accounts = balanceStr.split('&');
    for (const account of accounts) {
      const parts = account.split('|');
      if (parts.length < 6) continue;

      const name = parts[0].trim().toLowerCase();
      const currency = parts[1].trim();
      const currentBalance = parseFloat(parts[2]) || 0;
      const availableBalance = parseFloat(parts[3]) || 0;
      const reservedBalance = parseFloat(parts[4]) || 0;
      const unclearedBalance = parseFloat(parts[5]) || 0;

      const entry = { currentBalance, availableBalance, reservedBalance, unclearedBalance, currency };

      if (name.includes('working')) {
        balances.workingAccount = entry;
      } else if (name.includes('utility')) {
        balances.utilityAccount = entry;
      } else if (name.includes('merchant')) {
        balances.merchantAccount = entry;
      }
    }
    return balances;
  }

  @Get('balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get M-Pesa stored balance & trigger async refresh (admin only)' })
  @ApiQuery({ name: 'remarks', required: false, type: String, example: 'Balance check' })
  @ApiResponse({ status: 200, description: 'Stored M-Pesa balance returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async queryBalance(@Req() req, @Query('remarks') remarks?: string) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }

    const gateway = await this.gatewayModel.findOne({ type: 'mpesa', isActive: true }).exec();

    if (!gateway) {
      return { balance: null, currency: 'KES', message: 'No active M-Pesa gateway found' };
    }

    this.triggerBalanceRefresh(gateway, remarks).catch((err) =>
      console.error('[M-Pesa] Background balance refresh failed:', err.message),
    );

    return {
      balance: gateway.balance || null,
      currency: gateway.currency || 'KES',
    };
  }

  private async triggerBalanceRefresh(gateway: Gateway, remarks?: string): Promise<void> {
    let creds: Record<string, any> = {};
    try {
      const decrypted = this.cryptService.decryptWithPassphrase(gateway.credentials);
      creds = JSON.parse(decrypted);
    } catch {
      creds = {};
    }

    this.mpesaService.setCredentials(creds);
    await this.mpesaService.queryAccountBalance({
      remarks,
      resultUrl: creds.MPESA_BALANCE_RESULT_URL || creds.MPESA_B2C_RESULT_URL,
      timeoutUrl: creds.MPESA_BALANCE_TIMEOUT_URL || creds.MPESA_B2C_TIMEOUT_URL,
    });
  }

  @Get('incoming-transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List M-Pesa incoming transactions (payins) from local DB (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-03-05' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-04-05' })
  @ApiResponse({ status: 200, description: 'Incoming transactions returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getIncomingTransactions(
    @Req() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.listIncoming(page, limit, from, to);
  }

  @Get('payin-transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alias - list M-Pesa incoming transactions (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-03-05' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-04-05' })
  @ApiResponse({ status: 200, description: 'Incoming transactions returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getIncomingTransactionsAlias(
    @Req() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.listIncoming(page, limit, from, to);
  }

  @Get('outgoing-transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List M-Pesa outgoing transactions (payouts) from local DB (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-03-05' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-04-05' })
  @ApiResponse({ status: 200, description: 'Outgoing transactions returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getOutgoingTransactions(
    @Req() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.listOutgoing(page, limit, from, to);
  }

  @Get('payout-transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alias - list M-Pesa outgoing transactions (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-03-05' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-04-05' })
  @ApiResponse({ status: 200, description: 'Outgoing transactions returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getOutgoingTransactionsAlias(
    @Req() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.listOutgoing(page, limit, from, to);
  }

  @Post('balance/result')
  @ApiOperation({ summary: 'M-Pesa account balance result callback endpoint' })
  @ApiResponse({ status: 200, description: 'Callback accepted.' })
  @UsePipes(ValidationPipe)
  async balanceResultCallback(@Body() payload: any) {
    console.log('[M-Pesa balance result callback]:', JSON.stringify(payload || {}));

    const result = payload?.Result || payload?.result || payload;
    const balanceStr: string =
      result?.Balance || result?.balance || result?.DebitAccountBalance || '';

    if (balanceStr) {
      const parsed = this.parseMpesaBalance(balanceStr);
      if (parsed.workingAccount || parsed.utilityAccount || parsed.merchantAccount) {
        await this.gatewayModel
          .findOneAndUpdate(
            { type: 'mpesa', isActive: true },
            { $set: { balance: parsed } },
          )
          .exec();
        console.log('[M-Pesa] Balance stored in gateway:', JSON.stringify(parsed));
      }
    }

    return {
      ResultCode: 0,
      ResultDesc: 'Accepted',
      statusCode: HttpStatus.OK,
    };
  }

  @Post('balance/timeout')
  @ApiOperation({ summary: 'M-Pesa account balance timeout callback endpoint' })
  @ApiResponse({ status: 200, description: 'Callback accepted.' })
  @UsePipes(ValidationPipe)
  balanceTimeoutCallback(@Body() payload: any) {
    // Callback from Safaricom; no auth guard here.
    // eslint-disable-next-line no-console
    console.log('[M-Pesa balance timeout callback]:', JSON.stringify(payload || {}));
    return {
      ResultCode: 0,
      ResultDesc: 'Accepted',
      statusCode: HttpStatus.OK,
    };
  }
}
