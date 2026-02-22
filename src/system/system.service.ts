/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { System } from './system.schema';
import * as mongoose from 'mongoose';

@Injectable()
export class SystemService {
  constructor(
    @InjectModel(System.name)
    private systemModel: mongoose.Model<System>,
  ) { }

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

  async getSystemData(): Promise<any> {
    const res = await this.systemModel.findOne();
    return res;
  }

  async updateData(systemData: any): Promise<any> {

    const allowedFields = [
      'defaultLang',
      'appVersion',
      'appName',
      'appLogoUrl',
      'invoiceTaxes',
      'transferTaxes',
      'niu',
      'rccm',
      'companyName',
      'companyPhone1',
      'companyPhone2',
      'defaultCurrency',
      'companyEmail',
      'companyWhatsapp',
      'addressLine1',
      'addressLine2',
      'paymentGatwayAPIKey',
      'racineLink',
      'facebook',
      'website',
      'linkedIn',
      'instagram',
      'twitter',
    ];

    const patchData = Object.fromEntries(
      Object.entries(systemData || {}).filter(([key]) =>
        allowedFields.includes(key),
      ),
    );

    if (Object.keys(patchData).length === 0) {
      throw new NotFoundException('No valid settings fields provided');
    }

    try {
      const data = await this.systemModel
        .findOneAndUpdate(
          {},
          { $set: patchData, $setOnInsert: {} },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
          },
        )
        .lean();

      if (!data) {
        throw new NotFoundException('User settings not found');
      }

      return data;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error?.code === 11000) {
        throw new ConflictException('Duplicate key error while updating settings');
      }
      throw new ConflictException(error?.message || 'Error updating settings');
    }
  }

}
