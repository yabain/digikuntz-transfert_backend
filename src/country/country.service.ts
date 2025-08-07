/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Country } from './country.schema';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { CreateCountryDto } from './create-country.dto';

@Injectable()
export class CountryService {
  constructor(
    @InjectModel(Country.name)
    private countryModel: mongoose.Model<Country>,
  ) {}

  async findAll(query: Query): Promise<Country[]> {
    const resPerPage = 100;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          name: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};
    const countries = await this.countryModel
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);
    return countries;
  }

  async findInAllActive(query: Query): Promise<Country[]> {
    const resPerPage = 100;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          name: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};

    const filter = { ...keyword, status: true };

    const countries = await this.countryModel
      .find(filter)
      .limit(resPerPage)
      .skip(skip);

    return countries;
  }

  async getAllActive(): Promise<Country[]> {
    const keyword = {};
    const filter = { ...keyword, status: true };
    const countries = await this.countryModel.find(filter);
    return countries;
  }

  async creatCountry(country: CreateCountryDto): Promise<any> {
    try {
      console.log('Creating country with data:', country); // Log les données reçues
      const res = await this.countryModel.create(country);
      console.log('Country created successfully:', res); // Log le résultat de la création
      return false;
    } catch (error) {
      if (error.code === 11000) {
        console.log('This name country already exists');
      }
      return true; // Propager les autres erreurs
    }
  }

  async findById(countryId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(countryId)) {
      throw new NotFoundException('Invalid country ID');
    }

    const country = await this.countryModel.findById(countryId);
    if (!country) {
      throw new NotFoundException('Country not found');
    }

    return country;
  }

  async deleteCountry(countryId: string): Promise<any> {
    return await this.countryModel.findByIdAndDelete(countryId);
  }

  async updateCountry(
    countryId: string,
    countryData: CreateCountryDto,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(countryId)) {
      throw new NotFoundException('Invalid event ID');
    }

    const user = await this.countryModel.findByIdAndUpdate(
      countryId,
      countryData,
      {
        new: true,
        runValidators: true,
      },
    );
    return user;
  }

  async import(countries: any): Promise<any> {
    for (const country of countries) {
      console.log('current country: ' + country.name);
      const res = await this.countryModel.create(country);
      console.log('Existing country: ' + country, res);
    }
    return 'Countries imported successfully';
  }
}
