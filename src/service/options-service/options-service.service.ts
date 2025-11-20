/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { OptionsServiceSchema } from './options-service.shema';
import { ClientSession } from 'mongoose';

@Injectable()
export class OptionsServiceService {
  constructor(
    @InjectModel('OptionsService')
    private optionsModel: mongoose.Model<OptionsServiceService>,
  ) {}

  async getAllOptionsOfService(serviceId): Promise<OptionsServiceService[]> {
      if (!mongoose.Types.ObjectId.isValid(serviceId)) {
        throw new NotFoundException('Invalid plan ID');
      }
    const optionsList = await this.optionsModel.find({ serviceId });
    if(!optionsList){
      return [];
    }
    return optionsList;
  }

  async creatOptions(
    options: unknown,
    serviceId: any,
    session?: ClientSession,
  ): Promise<any[]> {
    let list: any;

    if (typeof options === 'string') {
      try {
        list = JSON.parse(options);
      } catch {
        throw new BadRequestException('options must be valid JSON');
      }
    } else {
      list = options;
    }

    console.log('option list:', list);
    console.log('serviceId:', serviceId);

    let res: any[] = [];
    for (const option of list) {
      const optionData: any = { ...option, serviceId };
      console.log('optionData:', optionData);
      const addData = await this.optionsModel.create(optionData);
      res = [...res, addData];
    }

    return res;
  }

  async deleteOptions(optionsId: any) {
    const options = await this.optionsModel.findByIdAndDelete(optionsId);
    return options;
  }

  async deleteOptionsOfPlan(plansId: any) {
    if (!mongoose.Types.ObjectId.isValid(plansId)) {
      throw new NotFoundException('Invalid plan ID');
    }
    const optionsList = await this.optionsModel.find({ plansId })
    for(const option of optionsList){
      await this.optionsModel.findByIdAndDelete(option._id)
    }
    return true;
  }

  async findByOptionId(optionsId): Promise<OptionsServiceService[]> {
    if (!mongoose.Types.ObjectId.isValid(optionsId)) {
      optionsId = new mongoose.Types.ObjectId(optionsId);
    }

    const options = await this.optionsModel.find({ optionsId }).exec();

    return options;
  }
  async updateOptions(optionseId: any, optionseData: any) {
    const optionse = await this.optionsModel.findByIdAndUpdate(
      optionseId,
      optionseData,
      {
        new: true,
        runValidators: true,
      },
    );
    return optionse;
  }

  // Méthode optimisée pour récupérer les options de plusieurs services
  async getAllOptionsOfServices(serviceIds: string[]): Promise<any[]> {
    if (!serviceIds || serviceIds.length === 0) {
      return [];
    }
    
    const validIds = serviceIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return [];
    }

    return await this.optionsModel
      .find({ serviceId: { $in: validIds } })
      .lean();
  }
}
