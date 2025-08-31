/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { CreateSoldeDto } from './create-solde.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Solde } from './solde.schema';

@Injectable()
export class SoldeService {
  constructor(
    @InjectModel(Solde.name)
    private soldeModel: mongoose.Model<Solde>,
  ) {}

  async creatSolde(data: CreateSoldeDto): Promise<any> {

    console.log('data', data);
    const solde = await this.soldeModel.create({ ...data });
    return solde;
  }

  async getSoldeByUserId(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    let solde = await this.soldeModel.findOne({ userId });
    if (!solde) {
      solde = await this.creatSolde({ userId, solde: 0})
    }
    return solde;
  }

  async updateSolde(userId: string, solde: number): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user');
    }

    // Update the user in the database
    const resp = await this.soldeModel.findByIdAndUpdate(
      userId,
      { solde },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!resp) {
      throw new NotFoundException('User not found');
    }

    return resp;
  }
}
