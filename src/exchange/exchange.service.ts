/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { Exchange } from './exchange.schema';
import { UserService } from 'src/user/user.service';
import { CountryService } from 'src/country/country.service';

@Injectable()
export class ExchangeService {
  private readonly logger = new Logger(ExchangeService.name);
  constructor(
    @InjectModel(Exchange.name)
    private exchangeModel: mongoose.Model<Exchange>,
    private httpService: HttpService,
    private configService: ConfigService,
    private userService: UserService,
    private countryService: CountryService,
  ) {}

  async getExchangeRate(): Promise<any> {
    let exchangeRate: any = await this.exchangeModel.find({});
    exchangeRate = exchangeRate[0];

    if (this.isMoreThan60MinutesPast(exchangeRate.timestamp)) {
      exchangeRate = await this.getExchangeRateOnLine();
      exchangeRate = await this.updateExchangeRate(exchangeRate);
    }

    const rates = {
      timestamp: exchangeRate.timestamp,
      base: exchangeRate.base,
      rates: JSON.parse(exchangeRate.rates),
    };
    return rates;
  }

  async setExchangeRate(exchangeRateData): Promise<any> {
    const rates = {
      ...exchangeRateData,
      rates: JSON.stringify(exchangeRateData.rates),
    };
    const exchangeRate = await this.exchangeModel.create(rates);
    return exchangeRate;
  }

  async updateExchangeRate(exchangeRateData: any): Promise<any> {
    const existing = await this.exchangeModel.findOne({});
    if (!existing)
      throw new NotFoundException('No exchange rate found to update');
    exchangeRateData.rates = JSON.stringify(exchangeRateData.rates);
    const exchange = await this.exchangeModel.findByIdAndUpdate(
      existing._id,
      exchangeRateData,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!exchange) throw new NotFoundException('Invalid exchange rate ID');
    return exchange;
  }

  async getExchangeRateOnLine(): Promise<any> {
    // console.log('get Exchange Rate OnLine');
    const getRate = async () => {
      try {
        const apiKey = `${this.configService.get<string>('OPEN_EXCHANGE_RATE_APIKEY')}`;
        const response: any = await firstValueFrom(
          this.httpService.get<any>(
            'https://openexchangerates.org/api/latest.json?app_id=' + apiKey,
          ),
        );
        return response.data;
      } catch (error) {
        console.error('Error checking transaction: ', error.message);
        return error;
      }
    };
    const rates = await getRate();
    return rates;
  }

  async convertCurrency(fromCurrency, toCurrency, amount = 1) {
    let rates = await this.getExchangeRate();
    rates = rates.rates;
    const rateFromUSDToFrom = rates[fromCurrency];
    const rateFromUSDToTo = rates[toCurrency];
    const amountInUSD = amount / rateFromUSDToFrom;
    const convertedAmount = amountInUSD * rateFromUSDToTo;
    return Number(convertedAmount.toFixed(2));
  }

  async getOtherRates(userId: string): Promise<any[]> {
    const userData = await this.userService.getUserById(userId);
    const allCountries: any[] = await this.countryService.getAllActive();
    const resp: any[] = [];
    for (const country of allCountries) {
      const data = {
        fromCountry: userData.countryId.name,
        toCountry: country.name,
        fromCurrency: userData.countryId.currency,
        toCurrency: country.currency,
        value: await this.convertCurrency(
          country.currency,
          userData.countryId.currency,
          1,
        ),
      };
      resp.push(data);
    }
    return resp;
  }

  isMoreThan60MinutesPast(timestamp) {
    const now = Date.now();
    const inputTime = timestamp * 1000;
    const differenceInMinutes = (now - inputTime) / (1000 * 60);
    // console.log('differenceInMinutes', differenceInMinutes);
    return differenceInMinutes > 60;
  }
}
