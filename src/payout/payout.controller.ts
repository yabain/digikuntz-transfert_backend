/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Get,ForbiddenException,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PayoutService } from './payout.service';

@ApiTags('payout')
@Controller('payout')
export class PayoutController {
  constructor(private payoutService: PayoutService) {}

  // init payout transaction
  @Get('payout/:transactionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create payout from transaction (admin only)' })
  @ApiParam({ name: 'transactionId', description: 'Transaction ID' })
  @ApiResponse({
    status: 200,
    description: 'Payout initialized.',
    schema: { example: { status: 'payout_pending', transactionId: '664f...' } },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createPayout(@Req() req, @Param('transactionId') transactionId) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.payoutService.createPayout(transactionId, req.user._id);
  }

  @Get('verify-payout/:id')
  @ApiOperation({ summary: 'Verify payout status by reference' })
  @ApiParam({ name: 'id', description: 'Payout reference' })
  @ApiResponse({
    status: 200,
    description: 'Payout status returned.',
    schema: { example: { status: 'SUCCESSFUL', reference: 'txPayout-...' } },
  })
  @ApiResponse({ status: 404, description: 'Payout not found.' })
  verifyPayout(@Param('id') reference: string) {
    console.log('verifyPayout tx: ', reference);
    return this.payoutService.verifyPayout(reference);
  }

  @Post('mpesa/result')
  @ApiOperation({ summary: 'M-Pesa B2C result callback' })
  @ApiBody({ schema: { example: { Result: { ResultCode: 0, ResultDesc: 'Success', ConversationID: 'AG_...', OriginatorConversationID: 'AG_...' } } } })
  @ApiResponse({ status: 201, description: 'Result callback processed.' })
  mpesaResult(@Body() payload: any) {
    return this.payoutService.handleMpesaB2CResult(payload);
  }

  @Post('mpesa/timeout')
  @ApiOperation({ summary: 'M-Pesa B2C timeout callback' })
  @ApiBody({ schema: { example: { Result: { ResultCode: 1037, ResultDesc: 'Timeout', ConversationID: 'AG_...' } } } })
  @ApiResponse({ status: 201, description: 'Timeout callback processed.' })
  mpesaTimeout(@Body() payload: any) {
    return this.payoutService.handleMpesaB2CTimeout(payload);
  }
}
