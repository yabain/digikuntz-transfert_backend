/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { System } from './system.schema';
import * as mongoose from 'mongoose';

@Injectable()
export class SystemService {
  constructor(
    @InjectModel(System.name)
    private systemModel: mongoose.Model<System>,
  ) {}

  /**
   * Retrieve system data.
   * @returns A promise that resolves to the system data.
   */
  async getData(): Promise<any> {
    return await this.systemModel.find();
  }

  async import(): Promise<any> {
    const systemData = {
      defaultLang: 'en',
      appVersion: '1.2.0',
      invoiceTaxes: 5,
      paymentGatwayAPIKey: '',
      racineLink: 'https://payments.digikuntz.com',
    };
    try {
      const res = await this.systemModel.create(systemData);
      return res;
    } catch (error: any) {
      throw new ConflictException(error);
    }
  }
}
