import {
  Body,
  Controller,
  Get,
  HttpStatus,
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

@ApiTags('mpesa')
@Controller('mpesa')
export class MpesaController {
  constructor(
    private readonly mpesaService: MpesaService,
    @InjectModel(Payin.name) private readonly payinModel: mongoose.Model<PayinDocument>,
    @InjectModel(Payout.name) private readonly payoutModel: mongoose.Model<PayoutDocument>,
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

    return {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
      data,
    };
  }

  @Get('balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Query M-Pesa account balance (admin only)' })
  @ApiQuery({ name: 'remarks', required: false, type: String, example: 'Balance check' })
  @ApiResponse({ status: 200, description: 'Balance query request sent to M-Pesa.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async queryBalance(@Req() req, @Query('remarks') remarks?: string) {
    if (!req.user?.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.mpesaService.queryAccountBalance({ remarks });
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
      throw new NotFoundException('Unauthorised');
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
      throw new NotFoundException('Unauthorised');
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
      throw new NotFoundException('Unauthorised');
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
      throw new NotFoundException('Unauthorised');
    }
    return this.listOutgoing(page, limit, from, to);
  }

  @Post('balance/result')
  @ApiOperation({ summary: 'M-Pesa account balance result callback endpoint' })
  @ApiResponse({ status: 200, description: 'Callback accepted.' })
  @UsePipes(ValidationPipe)
  balanceResultCallback(@Body() payload: any) {
    // Callback from Safaricom; no auth guard here.
    // Keep full payload in logs for reconciliation/support tracing.
    // eslint-disable-next-line no-console
    console.log('[M-Pesa balance result callback]:', JSON.stringify(payload || {}));
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
