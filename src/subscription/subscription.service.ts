/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Query } from 'express-serve-static-core';
import { InjectModel } from '@nestjs/mongoose';
import { Subscription } from './subscription.schema';
import * as mongoose from 'mongoose';
import { OptionsService } from './options/options.service';
import { generateFileUrl } from '../multer.config';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { UpdateSubscriptionDto } from './update-subscription.dto';
import { ItemService } from './item/item.service';

@Injectable()
export class SubscriptionService {
    
  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: mongoose.Model<Subscription>,
    private itemService: ItemService,
    private optionsService: OptionsService,
  ) {}

  async getSubscriptionsStatistic(): Promise<{ subscribersNumber: number; pourcentage: number }> {
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
        .populate('author')
      if (!subscription) {
        throw new NotFoundException('User not found');
      }
  
      // Enrich subscription data with follower and following counts
      let subscriptionData: any = { ...subscription };
      subscriptionData = subscriptionData._doc;
  
      return subscriptionData;
  }

  async creatSubscription(
    subscription: CreateSubscriptionDto,
    req: any,
    files?: Array<Express.Multer.File>,
  ): Promise<Subscription> {
    const userId = req.user._id;

    // Generate URLs for the uploaded files
    const fileUrls = files ? files.map((file) => generateFileUrl(file.filename)) : 'assets/img/ressorces/subscription_icon.png';

    // Prepare subscription data with the user ID and cover image URL
    const subscriptionData = {
      ...subscription,
      author: userId,
      imageUrl: fileUrls[0],
    };

    // Create the options in the database
    const res = await this.subscriptionModel.create(subscriptionData);

    // Create ticket classes for the options
    await this.optionsService.creatOptions(
      subscription.options,
      res._id,
    );

    return res;
  }

  async updateSubscription(subscriptionId: string, subscriptionData: UpdateSubscriptionDto): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    const subscription = await this.subscriptionModel.findByIdAndUpdate(subscriptionId, subscriptionData, {
      new: true,
      runValidators: true,
    });

    return subscription;
  }
  
  async deleteSubscription(subscriptionId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }
    return await this.subscriptionModel.findByIdAndDelete(subscriptionId);
  }
  
  async getSubscriberList(subscriptionId: string, userData: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    if (!mongoose.Types.ObjectId.isValid(userData._id)) {
      throw new NotFoundException('Invalid subscription ID');
    }

    const subscription: any = await this.subscriptionModel.findById(subscriptionId)
    if (userData._id === subscription.author || userData.isAdmin === true ) {
      const subscriberList: any =
        await this.itemService.getAllItemOfSubscription(subscriptionId);
      if (!subscriberList) {
        throw new NotFoundException('Event not found');
      }

      return subscriberList;
    }else {
      throw new NotFoundException('Unauthorized');
    }
  }
}