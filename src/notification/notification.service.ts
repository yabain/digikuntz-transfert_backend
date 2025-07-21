/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Notification } from './notification.schema';
import { Query } from 'express-serve-static-core';
import { Follow } from 'src/follow/follow.schema';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: mongoose.Model<Notification>,
    @InjectModel(Follow.name)
    private followModel: mongoose.Model<Follow>,
  ) {}

  async createEventNotification(
    userId: any,
    eventData: any,
    userRecipientId: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      userId = new mongoose.Types.ObjectId(userId);
    }
    if (!mongoose.Types.ObjectId.isValid(eventData._id)) {
      eventData._id = new mongoose.Types.ObjectId(eventData._id);
    }
    if (!mongoose.Types.ObjectId.isValid(userRecipientId)) {
      userRecipientId = new mongoose.Types.ObjectId(userRecipientId);
    }

    const notif: any = {
      userToId: userRecipientId.userId,
      isRead: false,
      eventId: eventData._id,
      userFromId: userId,
      type: 'eventCreation',
    };

    const addData = await this.notificationModel.create(notif);
    if (!addData) {
      throw new Error('Notification not fond');
    }
    if (addData) {
      // console.log('Notification crée 111');
    }

    return true;
  }

  async getNotificationsListOfUser(userId: any, query: Query): Promise<any> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    let userId2: any = userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      userId2 = new mongoose.Types.ObjectId(userId);
    }

    const notificationsList = await this.notificationModel
      .find({ userToId: userId2 })
      .populate('eventId')
      .populate('ticketId')
      .populate('transactionId')
      .populate('alertId')
      .populate('userFromId')
      .sort({ createdAt: -1 }) // Tri par createdAt en ordre décroissant
      .limit(resPerPage)
      .skip(skip);

    return notificationsList;
  }

  async createNotificationToFollowers(
    userId: any,
    eventData: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      userId = new mongoose.Types.ObjectId(userId);
    }

    const followersList: any = await this.followModel.find({
      followId: userId,
    });
    for (const follower of followersList) {
      this.createEventNotification(userId, eventData, follower);
    }
  }

  async makeAsReaded(userId: any, notifId: any) {
    if (!mongoose.Types.ObjectId.isValid(notifId)) {
      throw new NotFoundException('Invalid notification ID');
    }

    const notif = await this.notificationModel.find({
      notifId: notifId,
      userToId: userId,
    });
    // console.log('notif: ', notif);
    if (notif) {
      const notification = await this.notificationModel.findByIdAndUpdate(
        notifId,
        { isRead: true },
        {
          new: true,
          runValidators: true,
        },
      );
      if (notification) return true;
      else return false;
    } else return false;
  }

  async getUnreadNotifications(userId: any): Promise<any> {
    return this.notificationModel.find({
      userToId: userId,
      isRead: false,
    });
  }
}
