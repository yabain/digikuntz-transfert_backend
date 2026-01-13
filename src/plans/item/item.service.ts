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
import { Plans } from '../plans.schema';
import { EmailService } from 'src/email/email.service';
import { TransactionService } from 'src/transaction/transaction.service';

@Injectable()
export class ItemService {
  constructor(
    @InjectModel(Item.name)
    private itemModel: mongoose.Model<Item>,
    @InjectModel(Plans.name)
    private plansModel: mongoose.Model<Plans>,
    private emailService: EmailService,
    private transactionService: TransactionService
  ) {}

  async getItemById(itemId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      itemId = new mongoose.Types.ObjectId(itemId);
    }

    const item = await this.itemModel.findById({ itemId }).exec();
    if (!item) {
      throw new NotFoundException('items not found');
    }

    return item;
  }

  async getItemBySubscriptionId(subscriptionId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      subscriptionId = new mongoose.Types.ObjectId(subscriptionId);
    }

    const items = await this.itemModel.find({ subscriptionId }).populate('plansId');

    if (!items) {
      throw new NotFoundException('items not found');
    }

    return items;
  }

  async getItemSubscriptionByTransactionId(transactionId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      transactionId = new mongoose.Types.ObjectId(transactionId);
    }

    const item = await this.itemModel.findOne({ transactionId });

    if (!item) {
      throw new NotFoundException('items not found');
    }

    return item;
  }

  async getAllItemOfPlans(plansId: any): Promise<Item[]> {
    if (!mongoose.Types.ObjectId.isValid(plansId)) {
      plansId = new mongoose.Types.ObjectId(plansId);
    }

    const items = await this.itemModel.find({ plansId }).exec();
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
      .populate('plansId')
      .exec();
    if (!items) {
      throw new NotFoundException('items not found');
    }
    return items;
  }

  async createItem(
    item: CreateItemDto,
    userData: User,
    sendMail?: boolean,
  ): Promise<any> {
    const plansData: any = await this.plansModel
      .findById(item.plansId)
    if (!plansData) {
      throw new NotFoundException('Plan not found');
    }

    const itemData = {
      ...item,
      isActive: true,
    };

    const createdItemt = await this.itemModel.create(itemData);

    // Envoi d'email non-bloquant et indépendant
    // if (sendMail) {
      this.sendEmailNonBlocking(userData, plansData, item).catch(
        (error) => {
          console.error(
            'Failed to send plans email (non-blocking):',
            error,
          );
        },
      );
    // }

    return createdItemt;
  }

  async decrementSubscriberNumber(plansId: string): Promise<any> {
    return this.plansModel
      .findByIdAndUpdate(
        plansId,
        { $inc: { subscriberNumber: -1 } },
        { new: true },
      )
      .exec();
  }
  
  private async sendEmailNonBlocking(userData, plansData, itemData): Promise<void> {
    const transactionData: any = await this.transactionService.findById(itemData.transactionId.toString())
    if (!plansData) {
      throw new NotFoundException('Plan not found');
    }

    try {
      if (plansData) {
        await this.senMail(userData, plansData, transactionData);
      }
    } catch (error) {
      console.error('Error in non-blocking email sending:', error);
    }
  }
  
  async senMail(userData, plansData, transactionData): Promise<any> {
    return await this.emailService.sendPaymentConfirmationEmail(userData, plansData, transactionData);
  }


  async createItemForUpdate(
    item: CreateItemDto,
  ): Promise<any> {
    console.log('Enter createItemForUpdate: ', item);

    const itemData = {
      ...item,
      isActive: true,
    };

    const createdItemt = await this.itemModel.create(itemData);
    if (createdItemt) console.log('createItemForUpdate done for: ',createdItemt);

    return createdItemt;
  }
}
