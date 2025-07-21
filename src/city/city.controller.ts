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

@Controller('city')
export class CityController {
  constructor(private cityService: CityService) {}

  @Get()
  async findAllCities(@Query() query: ExpressQuery): Promise<City[]> {
    return this.cityService.findAllCities(query);
  }

  @Post('new')
  @UseGuards(AuthGuard('jwt')) // Applique un garde (guard) pour protéger la route. Ici, `AuthGuard` est utilisé pour vérifier l'authentification.
  @UsePipes(ValidationPipe) // Valide les données entrantes (body) en utilisant le DTO `CreateUserDto`
  async createCity(@Body() city: CreateCityDto): Promise<City> {
    return this.cityService.creatCity(city);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt')) // Applique un garde (guard) pour protéger la route. Ici, `AuthGuard` est utilisé pour vérifier l'authentification.
  @UsePipes(ValidationPipe) // Valide les données entrantes (body) en utilisant le DTO `CreateUserDto`
  async deleteCity(@Param('id') cityId: string): Promise<any> {
    return this.cityService.deleteCity(cityId);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt')) // Applique un garde (guard) pour protéger la route. Ici, `AuthGuard` est utilisé pour vérifier l'authentification.
  @UsePipes(ValidationPipe) // Valide les données entrantes (body) en utilisant le DTO `CreateUserDto`
  async updateCity(
    @Param('id') cityId: string,
    @Body() cityData: CreateCityDto,
  ): Promise<any> {
    return this.cityService.updateCity(cityId, cityData);
  }

  @Get(':id')
  async getCity(@Param('id') cityId: string): Promise<any> {
    return this.cityService.findById(cityId);
  }

  @Post('import')
  async importCities(): Promise<any> {
    return this.cityService.importCities();
  }
}
