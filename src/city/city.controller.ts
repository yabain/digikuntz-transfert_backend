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
import { CityService } from './city.service';
import { CreateCityDto } from './create-city.dto';
import { City } from './city.schema';
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

@ApiTags('city')
@Controller('city')
export class CityController {
  constructor(private cityService: CityService) {}

  @Get()
  @ApiOperation({ summary: 'Get all cities' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of cities returned.' })
  async findAllCities(@Query() query: ExpressQuery): Promise<City[]> {
    return this.cityService.findAllCities(query);
  }

  @Post('new')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new city' })
  @ApiBody({ type: CreateCityDto })
  @ApiResponse({ status: 201, description: 'City created.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createCity(@Body() city: CreateCityDto): Promise<City> {
    return this.cityService.creatCity(city);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a city by ID' })
  @ApiParam({ name: 'id', description: 'City ID', type: String })
  @ApiResponse({ status: 200, description: 'City deleted.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async deleteCity(@Param('id') cityId: string): Promise<any> {
    return this.cityService.deleteCity(cityId);
  }

  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a city by ID' })
  @ApiParam({ name: 'id', description: 'City ID', type: String })
  @ApiBody({ type: CreateCityDto })
  @ApiResponse({ status: 200, description: 'City updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateCity(
    @Param('id') cityId: string,
    @Body() cityData: CreateCityDto,
  ): Promise<any> {
    return this.cityService.updateCity(cityId, cityData);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a city by ID' })
  @ApiParam({ name: 'id', description: 'City ID', type: String })
  @ApiResponse({ status: 200, description: 'City returned.' })
  async getCity(@Param('id') cityId: string): Promise<any> {
    return this.cityService.findById(cityId);
  }

  @Post('import')
  @ApiOperation({
    summary: 'Import cities from a file or external source',
  })
  @ApiResponse({ status: 201, description: 'Cities imported.' })
  async importCities(): Promise<any> {
    return this.cityService.importCities();
  }
}
