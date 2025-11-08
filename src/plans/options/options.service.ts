/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Options } from './options.shema';
import { ClientSession } from 'mongoose';

@Injectable()
export class OptionsService {
  constructor(
    @InjectModel(Options.name)
    private optionsModel: mongoose.Model<Options>,
  ) {}

  async getAllOptionsOfPlans(plansId): Promise<Options[]> {
      if (!mongoose.Types.ObjectId.isValid(plansId)) {
        throw new NotFoundException('Invalid plan ID');
      }
    const optionsList = await this.optionsModel.find({ plansId });
    if(!optionsList){
      return [];
    }
    return optionsList;
  }

  async creatOptions(
    options: unknown,
    plansId: any,
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

    let res: any[] = [];
    for (const option of list) {
      const optionData: any = { ...option, plansId };
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

  async findByOptionId(optionsId): Promise<Options[]> {
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

  // Méthode optimisée pour récupérer les options de plusieurs plans
  async getAllOptionsOfMultiplePlans(planIds: string[]): Promise<any[]> {
    if (!planIds || planIds.length === 0) {
      return [];
    }
    
    const validIds = planIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return [];
    }

    return await this.optionsModel
      .find({ plansId: { $in: validIds } })
      .lean();
  }
}
