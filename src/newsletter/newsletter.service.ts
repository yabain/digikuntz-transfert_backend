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

@Injectable()
export class NewsletterService {
  constructor(
    @InjectModel(Newsletter.name)
    private newsletterModel: mongoose.Model<Newsletter>,
  ) { }

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

  async creatSubscriber(subscriber: CreateSubscriberDto): Promise<Newsletter> {
    try {
      const res = await this.newsletterModel.create(subscriber);
      return res;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('This city name already exists');
      }
      throw error; // Propagate other errors
    }
  }

  async findById(subscribersId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(subscribersId)) {
      throw new NotFoundException('Invalid subscriber ID');
    }
    const subscribers = await this.newsletterModel.findById(subscribersId);
    if (!subscribers) {
      throw new NotFoundException('City not found');
    }
    return subscribers;
  }

  async deleteSubscriber(subscriberId: string): Promise<any> {
    return await this.newsletterModel.findByIdAndDelete(subscriberId);
  }
}
