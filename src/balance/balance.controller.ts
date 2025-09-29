/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
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
  ApiResponse,
} from '@nestjs/swagger';
import { BalanceService } from './balance.service';

@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get balance of current users' })
  @ApiResponse({ status: 200, description: 'Balance of users returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getBalance(@Req() req): Promise<any> {
    console.log('balance')
    return this.balanceService.getBalanceByUserId(req.user._id);
  }

  @Get('user/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get balance of users (admin only)' })
  @ApiResponse({ status: 200, description: 'Balance of users returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getBalanceOfUser(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.balanceService.getBalanceByUserId(userId);
  }
}
