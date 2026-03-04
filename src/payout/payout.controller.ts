/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
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
  @ApiResponse({ status: 200, description: 'Payout initialized.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createPayout(@Req() req, @Param('transactionId') transactionId) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.payoutService.createPayout(transactionId, req.user._id);
  }

  @Get('verify-payout/:id')
  @ApiOperation({ summary: 'Verify payout status by reference' })
  @ApiParam({ name: 'id', description: 'Payout reference' })
  @ApiResponse({ status: 200, description: 'Payout status returned.' })
  @ApiResponse({ status: 404, description: 'Payout not found.' })
  verifyPayout(@Param('id') reference: string) {
    console.log('verifyPayout tx: ', reference);
    return this.payoutService.verifyPayout(reference);
  }
}
