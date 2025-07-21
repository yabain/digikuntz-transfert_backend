/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Alert } from './alert.schema';
import { CreateAlertDto } from './create-alert.dto';
import { Query } from 'express-serve-static-core';

@Injectable()
export class AlertService {
  constructor(
    @InjectModel(Alert.name)
    private alertModel: mongoose.Model<Alert>,
  ) {}

  async chekIfIAlerts(currentUserId: any, userId: any): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      userId = new mongoose.Types.ObjectId(userId);
    }

    const filter = {
      userId: currentUserId,
      alertId: userId,
    };

    const alertStatus = await this.alertModel.find(filter).exec();
    if (alertStatus.length > 0) return true;
    else return false;
  }

  async createAlert(userId: any, alertType): Promise<any> {
    if (mongoose.Types.ObjectId.isValid(userId)) {
      userId = new mongoose.Types.ObjectId(userId);
    } else {
      throw new Error('userId is not a valid ObjectId');
    }

    const alertData: CreateAlertDto = {
      userId: userId,
      alertType: alertType,
      title: 'Title',
      message: 'Violation of security',
      objectId: '',
    };

    const addData = await this.alertModel.create(alertData);
    if (!addData) {
      throw new Error('Alert not fond');
    }

    return true;
  }

  async getAlertsNumber(currentUserId: any): Promise<any> {
    let userId: any = currentUserId;
    if (!mongoose.Types.ObjectId.isValid(currentUserId)) {
      userId = new mongoose.Types.ObjectId(currentUserId);
    }

    const alert = await this.alertModel.find({ userId }).exec();
    return alert;
  }

  async getAlertsList(
    currentUserId: any,
    query: Query,
    resPerPage?: number,
  ): Promise<any> {
    if (!resPerPage) {
      resPerPage = 20;
    }
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    let currentUserId2: any = currentUserId;
    if (!mongoose.Types.ObjectId.isValid(currentUserId)) {
      currentUserId2 = new mongoose.Types.ObjectId(currentUserId);
    }

    const alerts = await this.alertModel
      .find({ followId: currentUserId2 })
      .populate('userId')
      .limit(resPerPage)
      .skip(skip);

    let alertsData: any = [];
    for (const alert of alerts) {
      try {
        let user: any = alert.userId;
        const alerts = await this.getAlertsNumber(user._id);
        user = { ...user._doc, alerts: alerts.length };
        alertsData = [...alertsData, user];
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    }
    return alertsData;
  }
}
