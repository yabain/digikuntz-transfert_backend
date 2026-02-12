/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { UserSettings } from './userSettings.schema';

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectModel(UserSettings.name)
    private userSettingsModel: mongoose.Model<UserSettings>,
    private readonly configService: ConfigService,
  ) {}

  async creatUserSettingd(userId: string, userSettings: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    return await this.userSettingsModel.create({
      userId: userId,
      ...userSettings,
    });
  }

  async getUserSettings(userId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    const settings = await this.userSettingsModel.findOne({ userId: userId });
    if (!settings) {
      return await this.creatUserSettingd(userId, {
        layoutPosition: 1,
        layoutColor: 1,
        layoutTopColor: 1,
        layoutSidebarColor: 1,
        layoutWidth: 1,
        layoutPositionScroll: 1,
        layoutSidebarSize: 1,
        layoutSidebarView: 1,
        portal: false,
        portalPrimaryColor: '#021d66',
        portalSecondaryColor: '#F57C11',
        portalServices: false,
        portalDescription: false,
        portalSupportInfo: false,
        portalFooter: false,
        portalContact: false,
        portalSubscription: false,
        portalFundraising: false,
      });
    }
    // console.log('res getUserSettings: ', settings);
    return settings;
  }

  async updateUserSettings(userId: string, userSettings: any): Promise<any> {

    const settings = await this.getUserSettings(userId);
    if (!settings) {
      return await this.creatUserSettingd(userId, userSettings);
    }
    const resp = await this.userSettingsModel.findOneAndUpdate(
      { userId: userId },
      userSettings,
      { new: true },
    );
    // console.log('res getUserSettings: ', resp);
    return resp;
  }

  async updateItems(userId: any, userSettingsData: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const allowedFields = [
      'layoutPosition',
      'layoutColor',
      'layoutTopColor',
      'layoutSidebarColor',
      'layoutWidth',
      'layoutPositionScroll',
      'layoutSidebarSize',
      'layoutSidebarView',
      'portal',
      'portalServices',
      'portalPrimaryColor',
      'portalSecondaryColor',
      'portalDescription',
      'portalSupportInfo',
      'portalFooter',
      'portalContact',
      'portalSubscription',
      'portalFundraising',
      'headTitlePortal',
      'headTitlePortalColor',
      'headTextPortal',
      'headTextPortalColor',
    ];

    const patchData = Object.fromEntries(
      Object.entries(userSettingsData || {}).filter(([key]) =>
        allowedFields.includes(key),
      ),
    );

    if (Object.keys(patchData).length === 0) {
      throw new NotFoundException('No valid settings fields provided');
    }

    try {
      const settings = await this.userSettingsModel
        .findOneAndUpdate(
          { userId },
          { $set: patchData, $setOnInsert: { userId } },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
          },
        )
        .lean();

      if (!settings) {
        throw new NotFoundException('User settings not found');
      }

      return this.normalizeSettingsResponse(settings);
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

  private normalizeSettingsResponse(settings: any): any {
    if (!settings) return settings;

    return {
      ...settings,
      portal: settings.portal ?? false,
      portalServices: settings.portalServices ?? false,
      portalDescription: settings.portalDescription ?? false,
      portalSupportInfo: settings.portalSupportInfo ?? false,
      portalFooter: settings.portalFooter ?? false,
      portalContact: settings.portalContact ?? false,
      portalSubscription: settings.portalSubscription ?? false,
      portalFundraising: settings.portalFundraising ?? false,
    };
  }
}
