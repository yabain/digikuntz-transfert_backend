/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Query } from 'express-serve-static-core';
import { InjectModel } from '@nestjs/mongoose';
import { Subscription } from './subscription.schema';
import * as mongoose from 'mongoose';
import { OptionsService } from '../options/options.service';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { UpdateSubscriptionDto } from './update-subscription.dto';
import { ItemService } from '../item/item.service';
import { WhatsappService } from 'src/wa/whatsapp.service';
import { UserService } from 'src/user/user.service';
import { Item } from '../item/item.shema';
import { PlansService } from '../plans.service';
import { TransactionService } from 'src/transaction/transaction.service';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: mongoose.Model<Subscription>,
    private itemService: ItemService,
    private optionsService: OptionsService,
    @Inject(forwardRef(() => WhatsappService))
    private whatsappService: WhatsappService,
    private userService: UserService,
    @Inject(forwardRef(() => PlansService))
    private plansService: PlansService,
    private transactionService: TransactionService
  ) { }

  async subscribe(subscriptionData: CreateSubscriptionDto, transactionId = undefined) {
    console.log('subscribr-subscriptionData: ', subscriptionData);

    console.log('subscribr-transactionId param: ', transactionId ? transactionId : 'No transactionId');

    const subscriptionStatus = await this.verifySubscription(
      subscriptionData.userId,
      subscriptionData.planId,
    );

    console.log('subscribr-verifySubscription: ', subscriptionStatus);
    if (subscriptionStatus.existingSubscription === true) {
      if (transactionId !== undefined) {
        console.log('starting upgrade');
        return await this.upgradeSubscription(
          subscriptionStatus.id,
          transactionId
        );
      } else {
        throw new NotFoundException('Subscription already exists and need transactionId to upgrade');
      }
    } else {
      if (transactionId !== undefined) {
        console.log('starting createSubscriptionWithTransaction');
        return await this.createSubscriptionWithTransaction(subscriptionData, transactionId);
      } else {
        console.log('starting createSubscriptionWithoutTransaction');
        return await this.createSubscriptionWithoutTransaction(subscriptionData)
      };
    }
  }

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

  calculateNewStartDate(startDate: string, cycle: string): Date {
    const newStartDate = new Date(startDate);

    if (isNaN(newStartDate.getTime())) {
      throw new Error('startDate invalide');
    }

    switch (cycle) {
      case 'dayly':
        newStartDate.setHours(newStartDate.getHours() + 1);
        break;

      case 'monthly':
        newStartDate.setDate(newStartDate.getDate() + 1);
        break;

      case 'yearly':
        newStartDate.setMonth(newStartDate.getMonth() + 1);
        break;

      default:
        throw new Error(`Cycle non supporté: ${cycle}`);
    }

    return newStartDate;
  }

  async createSubscriptionWithoutTransaction(
    subscriptionData: CreateSubscriptionDto,
  ): Promise<Subscription> {
    // Calculate subscrioption date
    const startDate = subscriptionData.startDate
      ? new Date(subscriptionData.startDate)
      : new Date();

    const endDate = this.calculateEndDate(
      startDate,
      subscriptionData.cycle,
      subscriptionData.quantity,
    );

    // Construct subscription with calculeted data
    const subscriptionWithDates = {
      ...subscriptionData,
      startDate,
      endDate,
    };

    const res = await this.subscriptionModel.create(subscriptionWithDates);
    console.log('(subscriptionService - createSubscriptionWhitoutTransaction) res: ', res);
    if (!res) {
      throw new NotFoundException('Subscription not created');
    }
    
    const subscription = await this.subscriptionModel
      .findById(res._id)
      .populate('userId')
      .populate('receiverId')
      .populate('planId');
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    console.log('createSubscriptionWithoutTransaction - subscription populated: ', subscription);
    const incrementSubscriberOnPlan = await this.plansService.incrementSubscriberNumber(subscriptionWithDates.planId.toString());

    console.log('incrementSubscriberOnPlan: ', incrementSubscriberOnPlan);

    void this.whatsappService.sendNewSubscriberMessageForPlanAuthor(
      subscription.planId,
      subscription.receiverId,
    );

    void this.whatsappService.sendNewSubscriberMessageFromPlanAuthor(
      subscription.planId,
      subscription.userId,
    );

    return res;
  }

  async createSubscriptionWithTransaction(
    subscriptionData: CreateSubscriptionDto,
    transactionId: any,
  ): Promise<Subscription> {
    const startDate = subscriptionData.startDate
      ? new Date(subscriptionData.startDate)
      : new Date();
    const endDate = this.calculateEndDate(
      startDate,
      subscriptionData.cycle,
      subscriptionData.quantity,
    );

    // Construct subscription with calculeted data
    const subscriptionWithDates = {
      ...subscriptionData,
      startDate,
      endDate,
    };

    const res = await this.subscriptionModel.create(subscriptionWithDates);
    if (!res) {
      throw new NotFoundException('Subscription not created');
    }
    const subscription = await this.subscriptionModel
      .findById(res._id)
      .populate('userId')
      .populate('receiverId')
      .populate('planId');
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    await this.plansService.incrementSubscriberNumber(subscription.planId.toString());

    if (startDate != endDate) {
      const item = {
        plansId: subscription.planId,
        userId: subscription.userId,
        receiverId: subscription.receiverId, // plan author Id
        subscriptionId: subscription._id as any,
        transactionId: transactionId as any || '',
        quantity: subscriptionData.quantity,
        dateStart: startDate.toISOString(),
        dateEnd: endDate.toISOString(),
        status: true,
      };
      await this.itemService.createItem(item, subscription.userId);
    }

    const receiverId =
      subscription.receiverId && subscription.receiverId.toString();
    const userId = subscription.userId && subscription.userId.toString();
    if (
      receiverId &&
      mongoose.Types.ObjectId.isValid(receiverId) &&
      subscription.planId
    ) {
      void this.whatsappService.sendNewSubscriberMessageForPlanAuthor(
        subscription.planId.toString(),
        receiverId,
      );
    }

    if (
      receiverId &&
      mongoose.Types.ObjectId.isValid(receiverId) &&
      subscription.planId
    ) {
      void this.whatsappService.sendNewSubscriberMessage(
        subscription.planId.toString(),
        receiverId,
        transactionId,
      );
    }

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
      .populate('userId')
      .populate('receiverId')
      .populate('planId');
    if (!subscription) {
      throw new NotFoundException('User not found');
    }

    // Enrich subscription data with follower and following counts
    let subscriptionData: any = { ...subscription };
    subscriptionData = subscriptionData._doc;

    return subscriptionData;
  }

  async getSubscriptionByUserIdAndPlanId(
    userId: string,
    planId: string,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid subscription ID');
    }
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    // Find the subscription by ID
    const subscription = await this.subscriptionModel
      .findOne({ userId: userId, planId: planId })
      .populate('userId')
      .populate('receiverId')
      .populate('planId');
    if (!subscription) {
      throw new NotFoundException('User not found');
    }

    // Enrich subscription data with follower and following counts
    let subscriptionData: any = { ...subscription };
    subscriptionData = subscriptionData._doc;

    return subscriptionData;
  }

  async verifySubscription(userId, planId, activateSubscription: boolean = false): Promise<any> {
    console.log('verifySubscription - userId: ', userId);
    console.log('verifySubscription - planId: ', planId);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid subscription ID');
    }
    const subscription = await this.subscriptionModel.findOne({
      userId,
      planId,
    });
    console.log('verifySubscription - subscriptionModel.findOne: ', subscription);
    if (!subscription) {
      return { existingSubscription: false }; // Subscription not found
    }

    const currentDate = new Date();
    if (currentDate > subscription.endDate && subscription.status === true) {
      // Update subscription status to inactive
      const statusUpdated = await this.subscriptionModel.findByIdAndUpdate(subscription._id, {
        status: activateSubscription,
      });
      console.log('statusUpdated: ', statusUpdated);
      return {
        existingSubscription: true,
        status: activateSubscription,
        id: subscription._id,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        data: subscription
      }; // 'Subscription expired';
    }

    console.log('no statusUpdated: ', {
      existingSubscription: true,
      status: subscription.status,
      id: subscription._id,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      data: subscription
    });
    return {
      existingSubscription: true,
      status: subscription.status,
      id: subscription._id,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      data: subscription
    };
  }

  async updateSubscription(
    subscriptionId,
    subscriptionData,
  ): Promise<any> {
    try {
      return await this.subscriptionModel.findByIdAndUpdate(
        subscriptionId,
        { subscriptionData },
        { new: true, runValidators: true },
      );
    }
    catch (error) {
      throw new NotFoundException('Error updating subscription');
    }
  }

  async upgradeSubscription(subscriptionId, transactionId) {
    const transactionData = await this.transactionService.findById(transactionId);
    if (!transactionData) {
      throw new NotFoundException('Transaction not found');
    }
    const additionalQuantity = transactionData.quantity;
    if (typeof additionalQuantity !== 'number' || additionalQuantity <= 0) {
      throw new NotFoundException('Invalid quantity to add');
    }

    const subscriptionData: any =
      await this.subscriptionModel.findById(subscriptionId);
    if (!subscriptionData) {
      throw new NotFoundException('Subscription not found');
    }
    console.log('upgradeSubscription-subscriptionData: ', subscriptionData);

    let newStartDate = new Date();
    if (subscriptionData.status === true) {
      newStartDate = subscriptionData.endDate;
    } else {
      if (subscriptionData.endDate.getTime() === subscriptionData.startDate.getTime()) {
        newStartDate = subscriptionData.startDate
      }
    }

    console.log('newStartDate: ', newStartDate);

    const newQuantityTotal =
      (subscriptionData.quantity || 0) + additionalQuantity;

    const newEndDate = this.calculateEndDate(
      new Date(newStartDate),
      subscriptionData.cycle,
      additionalQuantity,
    );

    const newStatus: boolean = newEndDate.getTime() > Date.now();

    const item = {
      plansId: subscriptionData.planId,
      userId: subscriptionData.userId,
      receiverId: subscriptionData.receiverId, // plan author Id
      subscriptionId: subscriptionData._id as any,
      transactionId: transactionId as any || '',
      quantity: subscriptionData.quantity,
      dateStart: newStartDate.toISOString(),
      dateEnd: newEndDate.toISOString(),
      status: true,
    }
    const itemCreate = await this.itemService.createItem(item, subscriptionData.userId);
    console.log('upgradeSubscription-itemCreate: ', itemCreate);

    if (!itemCreate) {
      throw new NotFoundException('Error creating item');
    }

    const updated = await this.subscriptionModel.findByIdAndUpdate(
      subscriptionData._id,
      {
        quantity: newQuantityTotal,
        endDate: newEndDate,
        status: newStatus,
      },
      { new: true, runValidators: true },
    );

    console.log('upgradeSubscription-updatedSubscription: ', updated);

    if (!updated) {
      throw new NotFoundException('Error upgrading subscription');
    }

    await this.whatsappService.sendNewSubscriberMessageFromPlanAuthor(subscriptionData.planId, subscriptionData.userId);
    await this.whatsappService.sendNewSubscriberMessage(subscriptionData.planId, subscriptionData.receiverId, transactionId.toString());
    return updated;
  }

  async updateStatus(subscriptionId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    const subscription = await this.subscriptionModel.findById(subscriptionId);
    if (!subscription) {
      throw new NotFoundException('subscription not found');
    }
    const status = subscription.status === true ? false : true;
    const updatedSubscription = await this.subscriptionModel.findByIdAndUpdate(
      subscriptionId,
      { status },
      { new: true, runValidators: true },
    );

    if (!updatedSubscription) {
      throw new NotFoundException('subscription not found');
    }
    return true;
  }

  async downgrateSubscription() { }

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
      userData._id.toString() !== subscriptionData.receiverId.toString() &&
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
        .populate('receiverId', 'name email');

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
        receiverId: userId,
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

  parseTransactionToSubscription(transaction) {
    return {
      userId: transaction.senderId, // Subscriber
      receiverId: transaction.receiverId, // Plan author
      planId: transaction.planId,
      quantity: Number(transaction.quantity),
      cycle: transaction.cycle,
      startDate: transaction.createdAt,
      endDate: this.calculateEndDate(
        transaction.createdAt,
        transaction.cycle,
        Number(transaction.quantity),
      ),
      status: true,
    };
  }

  async getSubscriptionsOfPlan(planId: string): Promise<Subscription[]> {
    return await this.subscriptionModel.find({ planId }).populate('userId');
  }

  async getItemSubscriptionByTransactionId(transactionId): Promise<Subscription[]> {
    return await this.itemService.getItemSubscriptionByTransactionId(transactionId);
  }

  async getSubscriptionsOfUser(userId: string): Promise<Subscription[]> {
    return await this.subscriptionModel.find({ userId }).populate('planId');
  }

  async getSubscriptionsItemsOfUser(subscriptionId, subscriberId): Promise<Item[]> {
    const allItems = await this.itemService.getItemBySubscriptionId(subscriptionId);
    console.log('allItems: ', allItems);
    const items = allItems.filter(item => item.userId.toString() === subscriberId.toString());
    return items;
  }

  // Retrieves all subscriptions, those where dateStart != dateEnd (because if dateStart === dateEnd, it's a subscription without payment, created by the plan owner),
  // Checks if one or more items exist where subscriptionId = subscription_id
  // If they exist, do nothing; if they don't exist, create an item for the subscription
  // async updateItemList(): Promise<any> {
  //   const subscriptions = await this.subscriptionModel.find();
  //   for (const subscription of subscriptions) {
  //     const itemList = await this.itemService.getItemBySubscriptionId(subscription._id);
  //     console.log('itemList length: ', itemList.length);
  //     if (itemList && itemList.length > 0) console.log('itemList exist');
  //     else {
  //       if (subscription.startDate.getTime() === subscription.endDate.getTime()) continue;
  //       console.log('createItemForUpdate start with: ', subscription);
  //       await this.itemService.createItemForUpdate({
  //         plansId: subscription.planId,
  //         subscriptionId: subscription._id,
  //         userId: subscription.userId,
  //         receiverId: subscription.receiverId,
  //         dateStart: subscription.startDate.toISOString(),
  //         dateEnd: subscription.endDate.toISOString()
  //       });
  //     }
  //   }
  // }
}
