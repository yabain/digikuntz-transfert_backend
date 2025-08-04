/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CountryService } from './country.service';
import { CreateCountryDto } from './create-country.dto';
import { Country } from './country.schema';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';

@Controller('country')
export class CountryController {
  constructor(private countryService: CountryService) {}

  @Get()
  async getAllCountries(@Query() query: ExpressQuery): Promise<Country[]> {
    // console.log('Getting all countries');
    return this.countryService.findAll(query);
  }

  @Get('available-countries')
  async getAllActive(): Promise<Country[]> {
    return this.countryService.getAllActive();
  }

  @Post('new')
  @UseGuards(AuthGuard('jwt')) // Applique un garde (guard) pour protéger la route. Ici, `AuthGuard` est utilisé pour vérifier l'authentification.
  @UsePipes(ValidationPipe) // Valide les données entrantes (body) en utilisant le DTO `CreateUserDto`
  async createCountry(@Body() country: CreateCountryDto): Promise<Country> {
    // console.log('Country creation');
    return this.countryService.creatCountry(country);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt')) // Applique un garde (guard) pour protéger la route. Ici, `AuthGuard` est utilisé pour vérifier l'authentification.
  @UsePipes(ValidationPipe) // Valide les données entrantes (body) en utilisant le DTO `CreateUserDto`
  async deleteCountry(@Param('id') countryId: string): Promise<any> {
    // console.log('Country deletion');
    return this.countryService.deleteCountry(countryId);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt')) // Applique un garde (guard) pour protéger la route. Ici, `AuthGuard` est utilisé pour vérifier l'authentification.
  @UsePipes(ValidationPipe) // Valide les données entrantes (body) en utilisant le DTO `CreateUserDto`
  async updateCountry(
    @Param('id') countryId: string,
    @Body() countryData: CreateCountryDto,
  ): Promise<any> {
    // console.log('Country deletion');
    return this.countryService.updateCountry(countryId, countryData);
  }

  @Get(':id')
  async getCountry(@Param('id') countryId: string): Promise<any> {
    // console.log('Getting one country');
    return this.countryService.findById(countryId);
  }

  @Post('import')
  async import(): Promise<any> {
    const countries = [
      {
        name: 'Cameroon',
        code: '237',
      },
      {
        name: 'Gabon',
        code: '241',
      },
      {
        name: 'Congo',
        code: '242',
      },
      {
        name: 'Guinee_equatoriale',
        code: '240',
      },
      {
        name: 'Nigeria',
        code: '234',
      },
      {
        name: 'Kenya',
        code: '254',
      },
      {
        name: 'Ivory_Coast',
        code: '225',
        flagUrl: 'assets/ressorces/ci.png',
      },
    ];
    return this.countryService.import(countries);
  }
}
