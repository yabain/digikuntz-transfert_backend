/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Item } from './item.shema';
import { CreateItemDto } from './create-item.dto';
import { User } from 'src/user/user.schema';
import { Subscription } from '../subscription.schema';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class ItemService {
  constructor(
    @InjectModel(Item.name)
    private itemModel: mongoose.Model<Item>,
    @InjectModel(Subscription.name)
    private subscriptionModel: mongoose.Model<Subscription>,
    private emailService: EmailService,
  ) {}

  async getAllItemOfSubscription(subscriptionId: any): Promise<Item[]> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      subscriptionId = new mongoose.Types.ObjectId(subscriptionId);
    }

    const items = await this.itemModel.find({ subscriptionId }).exec();
    if (!items) {
      throw new NotFoundException('items not found');
    }

    return items;
  }
  
  // Get all items of a user (by userId)
  async getAllMyItems(userId: any): Promise<Item[]> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      userId = new mongoose.Types.ObjectId(userId);
    }

    const items = await this.itemModel
      .find({ userId: userId })
      .populate('subscriptionId')
      .exec();
    if (!items) {
      throw new NotFoundException('items not found');
    }
    return items;
  }

  async createItem(
    item: CreateItemDto,
    user: User,
    sendMail?: boolean,
  ): Promise<any> {
    const subscriptionData: any = await this.subscriptionModel
      .findById(item.subscriptionId)
    if (!subscriptionData) {
      throw new NotFoundException('Itemt class not found');
    }

    if (!subscriptionData.isActive) {
      throw new NotFoundException('Event ended');
    }

    const itemData = {
      ...item,
      isActive: true,
    };

    const createdItemt = await this.itemModel.create(itemData);

    await this.incrementSubscriberNumber(subscriptionData._id);

    // Envoi d'email non-bloquant et indépendant
    if (sendMail && user.email) {
      this.sendEmailNonBlocking(subscriptionData._id, user).catch(
        (error) => {
          console.error(
            'Failed to send subscription email (non-blocking):',
            error,
          );
        },
      );
    }

    return createdItemt;
  }

  async incrementSubscriberNumber(subscriptionId: string): Promise<any> {
    return this.subscriptionModel
      .findByIdAndUpdate(
        subscriptionId,
        { $inc: { subscriberNumber: 1 } },
        { new: true },
      )
      .exec();
  }

  async decrementSubscriberNumber(subscriptionId: string): Promise<any> {
    return this.subscriptionModel
      .findByIdAndUpdate(
        subscriptionId,
        { $inc: { subscriberNumber: -1 } },
        { new: true },
      )
      .exec();
  }
  
  private async sendEmailNonBlocking(
    subscriptionData: string,
    user: User,
  ): Promise<void> {
    try {
      if (subscriptionData) {
        await this.senMail(subscriptionData, user);
      }
    } catch (error) {
      console.error('Error in non-blocking email sending:', error);
    }
  }
  
  async senMail(subscriptionData: any, user: any): Promise<any> {
    return await this.emailService.sendSubscriptionEmail(user, {
      subscriptionData: {
        _id: subscriptionData._id,
        title: subscriptionData.title,
        subTitle: subscriptionData.subTitle,
        cycle: subscriptionData.cycle,
        description: subscriptionData.description,
        cover: subscriptionData.imageUrl,
      },
    });
  }
}
