/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExchangeService } from './exchange.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('exchange')
@Controller('exchange')
export class ExchangeController {
  constructor(private exchangeService: ExchangeService) {}

  @Get('getExchangeRate')
  @ApiOperation({ summary: 'Get the current exchange rates' })
  @ApiResponse({ status: 200, description: 'Exchange rates returned.' })
  async getExchangeRate(@Req() req): Promise<any> {
    return this.exchangeService.getExchangeRate();
  }

  @Put('setExchangeRate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the exchange rates (admin only)' })
  @ApiBody({
    schema: {
      example: {
        rates: {
          USD: 1,
          EUR: 0.92,
          XAF: 610,
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Exchange rates updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateExchangeRate(@Req() req, @Body() Body): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.exchangeService.updateExchangeRate(Body.rates);
  }

  @Get('getExchangeRateOnLine')
  @ApiOperation({ summary: 'Get the latest exchange rates from online API' })
  @ApiResponse({ status: 200, description: 'Online exchange rates returned.' })
  async getExchangeRateOnLine(): Promise<any> {
    return this.exchangeService.getExchangeRateOnLine();
  }

  @Get('convertCurrency')
  @ApiOperation({
    summary: 'Convert an amount from one currency to another (GET)',
  })
  @ApiBody({
    schema: {
      example: {
        fromCurrency: 'USD',
        toCurrency: 'XAF',
        amount: 100,
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Converted amount returned.' })
  async convertCurrency(@Body() body: any): Promise<any> {
    return this.exchangeService.convertCurrency(
      body.fromCurrency,
      body.toCurrency,
      body.amount,
    );
  }

  @Post('convertCurrency')
  @ApiOperation({
    summary: 'Convert an amount from one currency to another (POST)',
  })
  @ApiBody({
    schema: {
      example: {
        fromCurrency: 'USD',
        toCurrency: 'XAF',
        amount: 100,
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Converted amount returned.' })
  async convertCurrency2(@Body() body: any): Promise<any> {
    return this.exchangeService.convertCurrency(
      body.fromCurrency,
      body.toCurrency,
      body.amount,
    );
  }

  @Get('other-rates')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get conversion rates from user country to all others',
  })
  @ApiResponse({ status: 200, description: 'Other rates returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getOtherRates(@Req() req: any): Promise<any> {
    return this.exchangeService.getOtherRates(req.user._id);
  }
}
