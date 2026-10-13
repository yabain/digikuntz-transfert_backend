/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { System } from './system.schema';
import * as mongoose from 'mongoose';
import { CryptService } from 'src/dev/crypt.service';

@Injectable()
export class SystemService {
  constructor(
    @InjectModel(System.name)
    private systemModel: mongoose.Model<System>,
    private cryptService: CryptService,
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
      whatsappNotificationsEnabled: true,
      emailNotificationsEnabled: true,
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
      'whatsappNotificationsEnabled',
      'emailNotificationsEnabled',
      'addressLine1',
      'addressLine2',
      'paymentGatwayAPIKey',
      'racineLink',
      'facebook',
      'website',
      'linkedIn',
      'instagram',
      'twitter',
      'transactionLimits',
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

  // ===== Security settings =====
  private static readonly GOOGLE_CRYPT_KEY =
    process.env.CRYPT_KEY || 'digikuntz-google-client-id-key';

  async getSecuritySettings(): Promise<any> {
    const res = await this.systemModel.findOne().lean();
    if (!res) return this.getDefaultSecuritySettings();
    return {
      twoFactorEnabled: res.twoFactorEnabled ?? true,
      googleLoginEnabled: res.googleLoginEnabled ?? true,
      hasGoogleClientId: !!res.encryptedGoogleClientId,
    };
  }

  async getSecuritySettingsWithKey(): Promise<any> {
    const res = await this.systemModel.findOne().lean();
    if (!res) return this.getDefaultSecuritySettingsWithKey();
    let googleClientId = '';
    if (res.encryptedGoogleClientId) {
      try {
        googleClientId = this.cryptService.decryptWithPassphrase(
          res.encryptedGoogleClientId,
          SystemService.GOOGLE_CRYPT_KEY,
        );
      } catch {
        googleClientId = '';
      }
    }
    return {
      twoFactorEnabled: res.twoFactorEnabled ?? true,
      googleLoginEnabled: res.googleLoginEnabled ?? true,
      googleClientId,
    };
  }

  async getPublicSecuritySettings(): Promise<any> {
    const res = await this.systemModel.findOne().lean();
    if (!res) return this.getDefaultSecuritySettings();
    return {
      twoFactorEnabled: res.twoFactorEnabled ?? true,
      googleLoginEnabled: res.googleLoginEnabled ?? true,
      encryptedGoogleClientId: res.encryptedGoogleClientId || '',
    };
  }

  private getDefaultSecuritySettings(): any {
    return {
      twoFactorEnabled: true,
      googleLoginEnabled: true,
      hasGoogleClientId: false,
    };
  }

  private getDefaultSecuritySettingsWithKey(): any {
    return {
      twoFactorEnabled: true,
      googleLoginEnabled: true,
      googleClientId: '',
    };
  }

  async updateSecuritySettings(data: {
    twoFactorEnabled?: boolean;
    googleLoginEnabled?: boolean;
    googleClientId?: string;
  }): Promise<any> {
    const patchData: any = {};

    if (data.twoFactorEnabled !== undefined) {
      patchData.twoFactorEnabled = data.twoFactorEnabled;
    }
    if (data.googleLoginEnabled !== undefined) {
      patchData.googleLoginEnabled = data.googleLoginEnabled;
    }
    if (data.googleClientId !== undefined && data.googleClientId.trim() !== '') {
      patchData.encryptedGoogleClientId = this.cryptService.encryptWithPassphrase(
        data.googleClientId.trim(),
        SystemService.GOOGLE_CRYPT_KEY,
      );
    }

    if (Object.keys(patchData).length === 0) {
      throw new NotFoundException('No valid security settings provided');
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
        throw new NotFoundException('System settings not found');
      }

      return {
        twoFactorEnabled: data.twoFactorEnabled ?? true,
        googleLoginEnabled: data.googleLoginEnabled ?? true,
        hasGoogleClientId: !!data.encryptedGoogleClientId,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error?.code === 11000) {
        throw new ConflictException('Duplicate key error while updating settings');
      }
      throw new ConflictException(error?.message || 'Error updating security settings');
    }
  }
}
