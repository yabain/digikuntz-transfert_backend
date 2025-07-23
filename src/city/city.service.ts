/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { City } from './city.schema';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { CreateCityDto } from './create-city.dto';
import { Cities } from './city'; // Vérifiez que ce fichier exporte bien un tableau ou objet valide

@Injectable()
export class CityService {
  constructor(
    @InjectModel(City.name)
    private cityModel: mongoose.Model<City>,
  ) {}

  /**
   * Find all cities with optional keyword search and pagination.
   * @param query - Query parameters for keyword search and pagination.
   * @returns A list of cities.
   */
  async findAllCities(query: Query): Promise<City[]> {
    const resPerPage = 10000;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    // Define the keyword search criteria
    const keyword = query.keyword
      ? {
          name: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};

    // Find cities matching the keyword with pagination and populate country data
    const cities = await this.cityModel
      .find({ ...keyword })
      .populate('countryId')
      .limit(resPerPage)
      .skip(skip);

    return cities;
  }

  /**
   * Create a new city.
   * @param city - The city data to create.
   * @returns The created city.
   * @throws ConflictException if the city name already exists.
   */
  async creatCity(city: CreateCityDto): Promise<City> {
    try {
      const res = await this.cityModel.create(city);
      return res;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('This city name already exists');
      }
      throw error; // Propagate other errors
    }
  }

  /**
   * Find a city by ID.
   * @param cityId - The ID of the city to retrieve.
   * @returns The city details.
   * @throws NotFoundException if the city ID is invalid or the city is not found.
   */
  async findById(cityId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(cityId)) {
      throw new NotFoundException('Invalid city ID');
    }

    const city = await this.cityModel.findById(cityId);
    if (!city) {
      throw new NotFoundException('City not found');
    }

    return city;
  }

  /**
   * Delete a city by ID.
   * @param cityId - The ID of the city to delete.
   * @returns The result of the deletion operation.
   */
  async deleteCity(cityId: string): Promise<any> {
    return await this.cityModel.findByIdAndDelete(cityId);
  }

  /**
   * Update a city by ID.
   * @param cityId - The ID of the city to update.
   * @param cityData - The updated city data.
   * @returns The updated city.
   * @throws NotFoundException if the city ID is invalid.
   */
  async updateCity(cityId: string, cityData: CreateCityDto): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(cityId)) {
      throw new NotFoundException('Invalid city ID');
    }

    const city = await this.cityModel.findByIdAndUpdate(cityId, cityData, {
      new: true,
      runValidators: true,
    });
    return city;
  }

  /**
   * Import cities into the database.
   * This method is used to seed the database with initial city data.
   */
  async importCities(): Promise<any> {
    const citiesInstance = new Cities(); // Instanciez la classe Cities
    // await this.importing(citiesInstance.cameroonCities);
    // await this.importing(citiesInstance.kenyaCities);
    // await this.importing(citiesInstance.nigeriaCities);
    // await this.importing(citiesInstance.congoCities);
    // await this.importing(citiesInstance.gabonCities);
    // await this.importing(citiesInstance.equatorialGuineeCities);
    await this.importing(citiesInstance.IvoryCoastCities);
  }

  async importing(cities) {
    if (!Array.isArray(cities)) {
      throw new Error('Cities must be an array of city data');
    }

    for (const city of cities) {
      try {
        await this.creatCity(city);
      } catch (error) {
        console.log('Existing city: ', city.name);
      }
    }
  }
}
