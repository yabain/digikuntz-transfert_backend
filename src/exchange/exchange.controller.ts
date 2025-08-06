/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ExchangeService } from './exchange.service';

@Controller('exchange')
export class ExchangeController {
  constructor(private exchangeService: ExchangeService) {}

  @Get('getExchangeRate')
  // @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  // @UsePipes(ValidationPipe) // Validate the incoming data
  async getExchangeRate(@Req() req): Promise<ExchangeService[]> {
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unautorised');
    // }
    return this.exchangeService.getExchangeRate();
  }

  @Put('setExchangeRate')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateExchangeRate(
    @Req() req,
    @Body() Body,
  ): Promise<ExchangeService[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.exchangeService.updateExchangeRate(Body.rates);
  }

  @Get('getExchangeRateOnLine')
  async getExchangeRateOnLine(): Promise<any> {
    return this.exchangeService.getExchangeRateOnLine();
  }

  @Get('convertCurrency')
  async convertCurrency(@Body() body: any): Promise<any> {
    return this.exchangeService.convertCurrency(
      body.fromCurrency,
      body.toCurrency,
      body.amount,
    );
  }

  @Post('convertCurrency')
  async convertCurrency2(@Body() body: any): Promise<any> {
    return this.exchangeService.convertCurrency(
      body.fromCurrency,
      body.toCurrency,
      body.amount,
    );
  }

  @Get('other-rates')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getOtherRates(@Req() req: any): Promise<any> {
    return this.exchangeService.getOtherRates(req.user._id);
  }
}
