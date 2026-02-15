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
import { PayoutService } from './payout.service';

@Controller('payout')
export class PayoutController {
  constructor(private payoutService: PayoutService) {}

  // init payout transaction
  @Get('payout/:transactionId')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createPayout(@Req() req, @Param('transactionId') transactionId) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.payoutService.createPayout(transactionId, req.user._id);
  }

  @Get('verify-payout/:id')
  verifyPayout(@Param('id') reference: string) {
    console.log('verifyPayout tx: ', reference);
    return this.payoutService.verifyPayout(reference);
  }
}
