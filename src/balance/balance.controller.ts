/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Body,
  Controller,
  Get,
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
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { BalanceService } from './balance.service';

@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) { }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get balance of current user' })
  @ApiResponse({ status: 200, description: 'Balance of user returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getBalance(@Req() req): Promise<any> {
    return this.balanceService.getBalanceByUserId(req.user._id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get balance of a user' })
  @ApiResponse({ status: 200, description: 'Balance of users returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getUserBalance(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.balanceService.getBalanceByUserId(userId);
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

  @Post('credit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Credit balance of user' })
  @ApiResponse({ status: 200, description: 'Balance of user returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async creditBalance(
    @Req() req,
    @Body() body: any,): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.balanceService.creditBalance(body.userId, body.amount, body.currency);
  }

  @Post('debit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Debit balance of user' })
  @ApiResponse({ status: 200, description: 'Balance of user returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async debitBalance(
    @Req() req,
    @Body() body: any,): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.balanceService.debitBalance(body.userId, body.amount, body.currency);
  }
}
