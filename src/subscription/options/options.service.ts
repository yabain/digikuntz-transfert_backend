/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Options } from './options.shema';

@Injectable()
export class OptionsService {
  constructor(
    @InjectModel(Options.name)
    private optionsModel: mongoose.Model<Options>,
  ) {}

  async creatOptions(options: any, subscriptionId: any): Promise<any> {
    options = JSON.parse(options);
    let res: any[] = [];
    for (const option of options) {
      const optionData: any = { ...option, subscriptionId };
      const addData = await this.optionsModel.create(optionData);
      res = [...res, addData];
    }

    return res;
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
}
