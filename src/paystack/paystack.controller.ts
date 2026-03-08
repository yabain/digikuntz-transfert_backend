import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Req,
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

@ApiTags('paystack')
@Controller('paystack')
export class PaystackController {
  constructor(private readonly paystackService: PaystackService) {}

  @Get('balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Paystack balance (KES/M-Pesa context)' })
  @ApiResponse({ status: 200, description: 'Balance returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  getBalance(@Req() req) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.paystackService.getBalance();
  }

  @Get('payin-transactions')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'List Paystack payin transactions (default: page=1, limit=10, newest first)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'success' })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-03-01' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-03-31' })
  @ApiResponse({ status: 200, description: 'Payin transactions returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  listPayinTransactions(@Req() req, @Query() query: any) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.paystackService.listPayinTransactions(query);
  }

  @Get('payout-transactions')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'List Paystack payout transactions (default: page=1, limit=10, newest first)',
  })
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
  listPayoutTransactions(@Req() req, @Query() query: any) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.paystackService.listPayoutTransactions(query);
  }
}
