/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Newsletter } from './newsletter.schema';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { CreateSubscriberDto } from './create-subscriber.dto';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class NewsletterService {
  constructor(
    @InjectModel(Newsletter.name)
    private newsletterModel: mongoose.Model<Newsletter>,
    private emailService: EmailService,
  ) {}

  async findAllSubscribers(query: Query): Promise<Newsletter[]> {
    const resPerPage = 10000;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    const keyword = query.keyword
      ? {
          name: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};
    const Subscribers = await this.newsletterModel
      .find({ ...keyword })
      .populate('countryId')
      .limit(resPerPage)
      .skip(skip);
    return Subscribers;
  }

  async creatSubscriber(subscriber: CreateSubscriberDto): Promise<any> {
    try {
      const res = await this.newsletterModel.create(subscriber);
      this.emailService.sendSubscriptionNewsletterEmail(
        subscriber.email,
        'en',
        subscriber.name,
      );
      return { status: true, message: 'Subscription created' };
    } catch (error) {
      if (error.code === 11000) {
        return { status: false, message: 'This email name already exists' };
        throw new ConflictException('This email name already exists');
      }
      return { status: false, message: 'Error to create Subscription' };
    }
  }

  async findById(subscribersId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscribersId)) {
      throw new NotFoundException('Invalid subscriber ID');
    }
    const subscribers = await this.newsletterModel.findById(subscribersId);
    if (!subscribers) {
      throw new NotFoundException('email not found');
    }
    return subscribers;
  }

  async deleteSubscriber(subscriberId: string): Promise<any> {
    return await this.newsletterModel.findByIdAndDelete(subscriberId);
  }
}
