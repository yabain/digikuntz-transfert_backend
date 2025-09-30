/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Query } from 'express-serve-static-core';
import { InjectModel } from '@nestjs/mongoose';
import { Subscription } from './subscription.schema';
import * as mongoose from 'mongoose';
import { OptionsService } from '../options/options.service';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { UpdateSubscriptionDto } from './update-subscription.dto';
import { ItemService } from '../item/item.service';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: mongoose.Model<Subscription>,
    private itemService: ItemService,
    private optionsService: OptionsService,
  ) {}

  async getSubscriptionsStatistic(): Promise<{
    subscribersNumber: number;
    pourcentage: number;
  }> {
    const subscribersNumber = await this.subscriptionModel.countDocuments();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const subscribersLast7Days = await this.subscriptionModel.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    const pourcentage =
      subscribersNumber === 0
        ? 0
        : Number(((subscribersLast7Days / subscribersNumber) * 100).toFixed(2));

    return { subscribersNumber, pourcentage };
  }

  /**
   * Calcule la date de fin d'abonnement en fonction du cycle et de la quantité
   * @param startDate Date de début de l'abonnement
   * @param cycle Cycle de l'abonnement (dayly, weekly, monthly, yearly)
   * @param quantity Nombre de cycles à ajouter
   * @returns Date de fin d'abonnement
   */
  calculateEndDate(startDate: Date, cycle: string, quantity: number): Date {
    const endDate = new Date(startDate);

    switch (cycle) {
      case 'dayly':
        endDate.setDate(endDate.getDate() + quantity);
        break;

      case 'weekly':
        endDate.setDate(endDate.getDate() + quantity * 7);
        break;

      case 'monthly':
        endDate.setMonth(endDate.getMonth() + quantity);
        break;

      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + quantity);
        break;

      default:
        throw new Error(`Cycle non supporté: ${cycle}`);
    }

    return endDate;
  }

  async creatSubscription(
    subscriptionData: CreateSubscriptionDto,
  ): Promise<Subscription> {
    // Calculer la date de fin d'abonnement
    const startDate = subscriptionData.startDate || new Date();
    const endDate = this.calculateEndDate(
      startDate,
      subscriptionData.cycle,
      subscriptionData.quantity,
    );

    // Créer l'abonnement avec les dates calculées
    const subscriptionWithDates = {
      ...subscriptionData,
      startDate,
      endDate,
    };

    const res = await this.subscriptionModel.create(subscriptionWithDates);
    return res;
  }

  async getAllSubscriptions(query: Query): Promise<Subscription[]> {
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          title: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};
    const optionsList = await this.subscriptionModel
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);

    return optionsList;
  }

  async getAllActiveSubscriptions(query: Query): Promise<Subscription[]> {
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          title: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};
    const optionsList = await this.subscriptionModel
      .find({ ...keyword, status: true })
      .limit(resPerPage)
      .skip(skip);
    return optionsList;
  }

  async getSubscriptionById(subscriptionId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    // Find the subscription by ID
    const subscription = await this.subscriptionModel
      .findById(subscriptionId)
      .populate('author');
    if (!subscription) {
      throw new NotFoundException('User not found');
    }

    // Enrich subscription data with follower and following counts
    let subscriptionData: any = { ...subscription };
    subscriptionData = subscriptionData._doc;

    return subscriptionData;
  }

  async getSubscriptionByUserIdAndPlanId(userId: string, planId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid subscription ID');
    }
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    // Find the subscription by ID
    const subscription = await this.subscriptionModel
      .findOne(
        { userId: userId, planId: planId }
      )
      .populate('author');
    if (!subscription) {
      throw new NotFoundException('User not found');
    }

    // Enrich subscription data with follower and following counts
    let subscriptionData: any = { ...subscription };
    subscriptionData = subscriptionData._doc;

    return subscriptionData;
  }

  async verifySubscription(userId: string, planId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid subscription ID');
    }
    const subscription = await this.subscriptionModel.findOne({
      userId: userId,
      planId: planId,
    });
    if (!subscription) {
      return false; // 'Subscription not found';
    }
    return true;
  }

  async updateSubscription(
    subscriptionId: string,
    subscriptionData: UpdateSubscriptionDto,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    const existingSubscription =
      await this.subscriptionModel.findById(subscriptionId);

    if (existingSubscription) {
      // Extend existing long
      const newQuantity =
        existingSubscription.quantity + subscriptionData.quantity;
      const newEndDate = this.calculateEndDate(
        existingSubscription.startDate,
        existingSubscription.cycle,
        newQuantity,
      );

      return await this.subscriptionModel.findByIdAndUpdate(
        subscriptionId,
        {
          quantity: newQuantity,
          endDate: newEndDate,
        },
        { new: true, runValidators: true },
      );
    } else {
      // Create a new subscription
      return await this.creatSubscription(subscriptionData);
    }
  }

  async upgrateSubscription(subscriptionData: any, newQuantity: number) {

    const subscription = await this.subscriptionModel.findByIdAndUpdate(
      { _id: subscriptionData._id },
      {
        $inc: { quantity: newQuantity },
        status: true,
        endDate: this.calculateEndDate(
          subscriptionData.startDate,
          subscriptionData.cycle,
          newQuantity,
        ),
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!subscription) {
      throw new NotFoundException('Error to upgrate subscription');
    }

    return subscription;
  }

  async downgrateSubscription() {}

  async stopSubscription(
    subscriptionId: string,
    subscriptionData: UpdateSubscriptionDto,
    userData: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }
    if (
      userData._id.toString() !== subscriptionData.userId.toString() &&
      !userData.isAdmin
    ) {
      throw new NotFoundException('Unauthorized');
    }

    const subscription = await this.subscriptionModel.findByIdAndUpdate(
      { _id: subscriptionId },
      { status: false },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!subscription) {
      throw new NotFoundException('Error to stop subscription');
    }

    return subscription;
  }

  async editSubscription(
    subscriptionId: string,
    subscriptionData: UpdateSubscriptionDto,
    userData: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }
    if (
      userData._id.toString() !== subscriptionData.planAuthor.toString() &&
      !userData.isAdmin
    ) {
      throw new NotFoundException('Unauthorized');
    }

    const subscription = await this.subscriptionModel.findByIdAndUpdate(
      { _id: subscriptionId },
      { ...subscriptionData },
      {
        new: true,
        runValidators: true,
      },
    );

    return subscription;
  }

  async deleteSubscription(
    subscriptionId: string,
    userData: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    const subscription: any =
      await this.subscriptionModel.findById(subscriptionId);
    if (userData._id === subscription.author || userData.isAdmin === true) {
      return await this.subscriptionModel.findByIdAndDelete(subscriptionId);
    } else {
      throw new NotFoundException('Unauthorized');
    }
  }

  async getSubscriptionList(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    try {
      const subscriptionList = await this.subscriptionModel
        .find({ userId })
        .populate('planId', 'title price cycle')
        .populate('planAuthor', 'name email');

      return subscriptionList;
    } catch (error) {
      throw new NotFoundException(
        `Error fetching subscription list: ${error.message}`,
      );
    }
  }

  async getSubscriberList(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid subscriber ID');
    }

    try {
      const subscriberList: any = await this.subscriptionModel.find({
        planAuthor: userId,
      });
      if (!subscriberList) {
        throw new NotFoundException('No subscriber found');
      }

      return subscriberList;
    } catch (e) {
      throw new NotFoundException(
        'Error to find subscriber list of user: ' + e,
      );
    }
  }

  async searchByTitle(query: Query): Promise<Subscription[]> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    // Define the keyword search criteria
    const keyword = query.keyword
      ? {
          $or: [{ title: { $regex: query.keyword, $options: 'i' } }],
        }
      : {};

    // Find users matching the keyword with pagination
    const subscriptions = await this.subscriptionModel
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);

    // Enrich user data with follower counts
    let subscriptionArray: any = [];
    for (const subscription of subscriptions) {
      let subscriptionData: any = { ...subscription };
      subscriptionData = subscriptionData._doc;
      subscriptionArray = [...subscriptionArray, subscriptionData];
    }

    return subscriptionArray;
  }

  async updateStatus(subscriptionId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    const subscription = await this.subscriptionModel.findById(subscriptionId);
    if (!subscription) {
      throw new NotFoundException('User not found');
    }
    const updatedUser = await this.subscriptionModel
      .findByIdAndUpdate(
        subscriptionId,
        { active: subscription.status ? false : true },
        { new: true, runValidators: true },
      )
      .populate('cityId')
      .populate('countryId');

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    return true;
  }

  // Obtenir les abonnements expirés
  async getExpiredSubscriptions(): Promise<Subscription[]> {
    return await this.subscriptionModel.find({
      endDate: { $lt: new Date() },
      status: true,
    });
  }

  // Renew subscription
  async renewSubscription(
    subscriptionId: string,
    additionalQuantity: number,
  ): Promise<any> {
    const subscription = await this.subscriptionModel.findById(subscriptionId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const newEndDate = this.calculateEndDate(
      subscription.endDate, // Start to current endDate
      subscription.cycle,
      additionalQuantity,
    );

    return await this.subscriptionModel.findByIdAndUpdate(
      subscriptionId,
      {
        quantity: subscription.quantity + additionalQuantity,
        endDate: newEndDate,
      },
      { new: true },
    );
  }

  // Verify if subscription is enabled
  async isSubscriptionActive(subscriptionId: string): Promise<boolean> {
    const subscription = await this.subscriptionModel.findById(subscriptionId);
    if (!subscription) return false;

    return subscription.status && new Date() <= subscription.endDate;
  }

  // Verify if user have an access to plan
  async hasAccessToPlan(userId: string, planId: string): Promise<boolean> {
    const subscription = await this.subscriptionModel.findOne({
      userId,
      planId,
      status: true,
      endDate: { $gte: new Date() },
    });

    return !!subscription;
  }
}
