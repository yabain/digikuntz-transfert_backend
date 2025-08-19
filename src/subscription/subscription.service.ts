/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Query } from 'express-serve-static-core';
import { InjectModel } from '@nestjs/mongoose';
import { Subscription } from './subscription.schema';
import * as mongoose from 'mongoose';
import { UserService } from 'src/user/user.service';
import { OptionsService } from './options/options.service';
import { generateFileUrl } from '../multer.config';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { UpdateSubscriptionDto } from './update-subscription.dto';

@Injectable()
export class SubscriptionService {
    
  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: mongoose.Model<Subscription>,
    private userService: UserService,
    private optionsService: OptionsService,
  ) {}

  async findAll(query: Query): Promise<Subscription[]> {
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

  async findAllActive(query: Query): Promise<Subscription[]> {
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
  
  async creatSubscription(
    subscription: CreateSubscriptionDto,
    req: any,
    files: Array<Express.Multer.File>,
  ): Promise<Subscription> {
    const userId = req.user._id;

    // Generate URLs for the uploaded files
    const fileUrls = files.map((file) => generateFileUrl(file.filename));

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
  
//   async getSubscriberList(subscriptionId: string): Promise<any> {
//     if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
//       throw new NotFoundException('Invalid subscription ID');
//     }

//     // Get all tickets for the subscription
//     const optionsList: any =
//       await this.optionsService.getAllOptions(subscriptionId);
//     if (!optionsList) {
//       throw new NotFoundException('Event not found');
//     }

//     // Remove duplicate participants based on user ID
//     const uniqueData = Object.values(
//       optionsList.reduce((acc, obj) => {
//         if (!acc[obj.userId]) {
//           acc[obj.userId] = obj;
//         }
//         return acc;
//       }, {}),
//     );

//     // Get user details for each participant
//     let participants: any[] = [];
//     for (const ticket of uniqueData as any[]) {
//       const userId = new mongoose.Types.ObjectId(ticket.userId);
//       const user = await this.userService.findById(userId);
//       participants = [...participants, user];
//     }

//     return participants;
//   }
}
