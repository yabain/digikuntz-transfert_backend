/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Ahead } from './ahead.schema';
import { Event } from '../event/event.schema';
import { Query } from 'express-serve-static-core';

@Injectable()
export class AheadService {
  constructor(
    @InjectModel(Ahead.name)
    private aheadModel: mongoose.Model<Ahead>,
    @InjectModel(Event.name)
    private eventModel: mongoose.Model<Event>,
  ) {}

  async getAllAheadEvent(query?: Query): Promise<any[]> {
    let page: number = 1;
    if (query) page = Number(query.page);
    const resPerPage = 10;
    const currentPage = Number(page);
    const skip = resPerPage * (currentPage - 1);

    const aheads = await this.aheadModel
      .find()
      .populate('eventId')
      .populate('cityId')
      .populate('countryId')
      .limit(resPerPage)
      .skip(skip);

    const res: any[] = [];
    for (const ahead of aheads) {
      let eventData: any = { ...ahead.eventId };
      eventData = eventData._doc;
      eventData.countryData = ahead.countryId;
      eventData.cityData = ahead.cityId;
      res.push(eventData);
    }

    return res;
  }

  async getAheadEventOfCity(id: any): Promise<any[]> {
    let cityId: any = id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      cityId = new mongoose.Types.ObjectId(id);
    }

    const aheads = await this.aheadModel
      .find({ cityId })
      .populate('eventId')
      .exec();
    let res: any[] = [];
    for (const ahead of aheads) {
      const aheadData: any = { ...ahead };
      const addData = aheadData._doc.eventId;
      res = [...res, addData];
    }
    return res;
  }

  async getAheadEventOfCountry(id: any): Promise<any[]> {
    let countryId: any = id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      countryId = new mongoose.Types.ObjectId(id);
    }

    const aheads = await this.aheadModel
      .find({ countryId })
      .populate('eventId')
      .exec();
    let res: any[] = [];
    for (const ahead of aheads) {
      const aheadData: any = { ...ahead };
      const addData = aheadData._doc.eventId;
      res = [...res, addData];
    }
    return res;
  }

  async chekIfEventIsInAheads(aheadId: any): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(aheadId)) {
      aheadId = new mongoose.Types.ObjectId(aheadId);
    }

    const aheads = await this.aheadModel.find({ eventId: aheadId }).exec();
    if (aheads.length > 0) return true;
    else return false;
  }

  async addToAhead(aheadData: any): Promise<any> {
    if (mongoose.Types.ObjectId.isValid(aheadData.countryId)) {
      aheadData.countryId = new mongoose.Types.ObjectId(aheadData.countryId);
    } else {
      throw new Error('userId is not a valid ObjectId');
    }

    if (mongoose.Types.ObjectId.isValid(aheadData.cityId)) {
      aheadData.cityId = new mongoose.Types.ObjectId(aheadData.cityId);
    } else {
      throw new Error('userId is not a valid ObjectId');
    }

    if (mongoose.Types.ObjectId.isValid(aheadData.eventId)) {
      aheadData.eventId = new mongoose.Types.ObjectId(aheadData.eventId);
    } else {
      throw new Error('userId is not a valid ObjectId');
    }

    const ahead = {
      eventId: aheadData.eventId,
      cityId: aheadData.cityId,
      countryId: aheadData.countryId,
    };

    const addData = await this.aheadModel.create(ahead);

    if (!addData) {
      throw new Error('Ahead not fond');
    }

    return true;
  }

  async removeToAheads(data: any): Promise<any> {
    let eventId: mongoose.Types.ObjectId;
    if (mongoose.Types.ObjectId.isValid(data)) {
      eventId = new mongoose.Types.ObjectId(data);
    } else {
      throw new Error('eventId is not a valid ObjectId');
    }

    const filter = {
      eventId: eventId,
    };

    const aheads = await this.aheadModel.find(filter).exec();
    if (aheads.length > 0) {
      const result = await this.aheadModel.findOneAndDelete(filter).exec();
      if (!result) {
        throw new Error('Favorit not fond');
      }
      return true;
    } else return false;
  }
}
