/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Follow } from './follow.schema';
import { CreateFollowDto } from './create-follow.dto';
import { Query } from 'express-serve-static-core';

@Injectable()
export class FollowService {
  constructor(
    @InjectModel(Follow.name)
    private followModel: mongoose.Model<Follow>,
  ) {}

  async chekIfIFollows(currentUserId: any, userId: any): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      userId = new mongoose.Types.ObjectId(userId);
    }

    const filter = {
      userId: currentUserId,
      followId: userId,
    };

    const followStatus = await this.followModel.find(filter).exec();
    if (followStatus.length > 0) return true;
    else return false;
  }

  async follow(currentUserId: any, userId: any): Promise<any> {
    if (mongoose.Types.ObjectId.isValid(userId)) {
      userId = new mongoose.Types.ObjectId(userId);
    } else {
      throw new Error('userId is not a valid ObjectId');
    }

    const followData: CreateFollowDto = {
      userId: currentUserId,
      followId: userId,
    };

    const addData = await this.followModel.create(followData);
    if (!addData) {
      throw new Error('Follow not fond');
    }

    return true;
  }

  async unFollow(currentUserId: any, userId: any): Promise<any> {
    let userId2: mongoose.Types.ObjectId;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      userId2 = new mongoose.Types.ObjectId(userId);
    } else {
      throw new Error('eventId is not a valid ObjectId');
    }

    const filter = {
      userId: currentUserId,
      followId: userId,
    };

    const datas = await this.followModel.find(filter).exec();
    if (datas.length > 0) {
      const result = await this.followModel.findOneAndDelete(filter).exec();
      if (!result) {
        throw new Error('Favorit not fond');
      }
      return true;
    } else return false;
  }

  async getFollowersNumber(currentUserId: any): Promise<any> {
    let userId: any = currentUserId;
    if (!mongoose.Types.ObjectId.isValid(currentUserId)) {
      userId = new mongoose.Types.ObjectId(currentUserId);
    }

    const followers = await this.followModel.find({ followId: userId }).exec();
    return followers;
  }

  async getFollowersList(
    currentUserId: any,
    query: Query,
    resPerPage?: number,
  ): Promise<any> {
    if (!resPerPage) {
      resPerPage = 20;
    }
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    let currentUserId2: any = currentUserId;
    if (!mongoose.Types.ObjectId.isValid(currentUserId)) {
      currentUserId2 = new mongoose.Types.ObjectId(currentUserId);
    }

    const followers = await this.followModel
      .find({ followId: currentUserId2 })
      .populate('userId')
      .limit(resPerPage)
      .skip(skip);

    let followersData: any = [];
    for (const follower of followers) {
      try {
        let user: any = follower.userId;
        const followers = await this.getFollowersNumber(user._id);
        user = { ...user._doc, followers: followers.length };
        followersData = [...followersData, user];
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    }
    return followersData;
  }

  async getFollowingsNumber(currentUserId: any): Promise<Follow[]> {
    let userId: any = currentUserId;
    if (!mongoose.Types.ObjectId.isValid(currentUserId)) {
      userId = new mongoose.Types.ObjectId(currentUserId);
    }

    const followings = await this.followModel.find({ userId: userId }).exec();
    return followings;
  }

  async getFollowingsList(userId: any, query: Query): Promise<any> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    let userId2: any = userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      userId2 = new mongoose.Types.ObjectId(userId);
    }

    const followings = await this.followModel
      .find({ userId: userId2 })
      .populate('followId')
      .limit(resPerPage)
      .skip(skip);

    let followingsData: any = [];
    for (const following of followings) {
      try {
        let user: any = following.followId;
        const followings = await this.getFollowersNumber(user._id);
        user = { ...user._doc, followers: followings.length };
        followingsData = [...followingsData, user];
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    }
    return followingsData;
  }
}
