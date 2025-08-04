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
    console.log('get Exchange Rate OnLine 000');
    return this.exchangeService.getExchangeRateOnLine();
  }

  @Get('convertCurrency')
  async convertCurrency(@Body() body: any): Promise<any> {
    console.log('get Exchange Rate OnLine 000');
    return this.exchangeService.convertCurrency(
      body.fromCurrency,
      body.toCurrency,
      body.amount,
    );
  }

  @Post('convertCurrency')
  async convertCurrency2(@Body() body: any): Promise<any> {
    console.log('get Exchange Rate 2 000');
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
    console.log('get other rates');
    return this.exchangeService.getOtherRates(req.user._id);
  }

  //////////////////////////////////////////
  @Get('*path')
  getRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }

  @Post('*path')
  postRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }

  @Put('*path')
  putRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }

  @Delete('*path')
  deleteRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }
}
