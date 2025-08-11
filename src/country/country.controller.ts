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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('country')
@Controller('country')
export class CountryController {
  constructor(private countryService: CountryService) {}

  @Get()
  @ApiOperation({ summary: 'Get all countries' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of countries returned.' })
  async getAllCountries(@Query() query: ExpressQuery): Promise<Country[]> {
    return this.countryService.findAll(query);
  }

  @Get('available-countries')
  @ApiOperation({ summary: 'Get all active (available) countries' })
  @ApiResponse({
    status: 200,
    description: 'List of active countries returned.',
  })
  async getAllActive(): Promise<Country[]> {
    return this.countryService.getAllActive();
  }

  @Post('new')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new country' })
  @ApiBody({ type: CreateCountryDto })
  @ApiResponse({ status: 201, description: 'Country created.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createCountry(@Body() country: CreateCountryDto): Promise<Country> {
    return this.countryService.creatCountry(country);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a country by ID' })
  @ApiParam({ name: 'id', description: 'Country ID', type: String })
  @ApiResponse({ status: 200, description: 'Country deleted.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async deleteCountry(@Param('id') countryId: string): Promise<any> {
    return this.countryService.deleteCountry(countryId);
  }

  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a country by ID' })
  @ApiParam({ name: 'id', description: 'Country ID', type: String })
  @ApiBody({ type: CreateCountryDto })
  @ApiResponse({ status: 200, description: 'Country updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateCountry(
    @Param('id') countryId: string,
    @Body() countryData: CreateCountryDto,
  ): Promise<any> {
    return this.countryService.updateCountry(countryId, countryData);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a country by ID' })
  @ApiParam({ name: 'id', description: 'Country ID', type: String })
  @ApiResponse({ status: 200, description: 'Country returned.' })
  async getCountry(@Param('id') countryId: string): Promise<any> {
    return this.countryService.findById(countryId);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import a list of countries (dev only)' })
  @ApiResponse({ status: 201, description: 'Countries imported.' })
  async import(): Promise<any> {
    const countries = [
      { name: 'Cameroon', code: '237' },
      { name: 'Gabon', code: '241' },
      { name: 'Congo', code: '242' },
      { name: 'Guinee_equatoriale', code: '240' },
      { name: 'Nigeria', code: '234' },
      { name: 'Kenya', code: '254' },
      { name: 'Ivory_Coast', code: '225', flagUrl: 'assets/ressorces/ci.png' },
    ];
    return this.countryService.import(countries);
  }
}
