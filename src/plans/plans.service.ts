/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Query } from 'express-serve-static-core';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { OptionsService } from './options/options.service';
import { CreatePlansDto } from './create-plans.dto';
import { UpdatePlansDto } from './update-plans.dto';
import { ItemService } from './item/item.service';
import { Plans } from './plans.schema';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { AuthService } from 'src/auth/auth.service';
import { SubscriptionService } from './subscription/subscription.service';
import { WhatsappService } from 'src/wa/whatsapp.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class PlansService {
  constructor(
    @InjectModel(Plans.name)
    private plansModel: mongoose.Model<Plans>,
    private itemService: ItemService,
    private optionsService: OptionsService,
    private fwService: FlutterwaveService,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    @Inject(forwardRef(() => WhatsappService))
    private waService: WhatsappService,
    private userService: UserService,
  ) {}

  private sanitizeUser(user: any): any {
    if (!user) return user;
    const obj = user.toObject ? user.toObject() : user; // convert mongoose doc to object if needed
    delete obj.password;
    delete obj.resetPasswordToken;
    delete obj.balance;
    return obj;
  }

  async getAllPlans(query: Query): Promise<Plans[]> {
    const resPerPage = 50;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          title: {
            $regex: query.keyword as string,
            $options: 'i',
          },
        }
      : {};
      
    const plansList = await this.plansModel
      .find({ ...keyword })
      .populate('author', 'name email pictureUrl')
      .sort({ createdAt: -1 })
      .limit(resPerPage)
      .skip(skip);

    const resp: any = [];
    for (const plan of plansList) {
      const planOption = await this.optionsService.getAllOptionsOfPlans(
        plan._id,
      );
      const planData = { ...plan.toObject(), options: planOption };
      resp.push(planData);
    }
    return resp;
  }

  async getPlansList(userId: string, reqUser): Promise<Plans[]> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    let idUser = '';
    idUser = reqUser.isAdmin ? userId : reqUser._id;
    const plansList = await this.plansModel
      .find({ author: idUser })
      .populate('author');
    if (!plansList) {
      return [];
    }

    const resp: any = [];
    for (const plan of plansList) {
      const planOption = await this.optionsService.getAllOptionsOfPlans(
        plan._id,
      );
      const planData = { ...plan.toObject(), options: planOption };
      resp.push(planData);
    }

    // console.log('user plan list', resp);
    return resp;
  }

  async getPlansStatistics(long?: number): Promise<any> {
    const totalPlans = await this.plansModel.countDocuments();

    const duration = long ?? 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - duration);

    const plansLastNDays = await this.plansModel.countDocuments({
      createdAt: { $gte: sinceDate },
    });

    const inactivePlans = await this.plansModel.countDocuments({
      isActive: false,
    });

    const activePlans = totalPlans - inactivePlans;

    const percentage =
      totalPlans === 0
        ? 0
        : Number(((plansLastNDays / totalPlans) * 100).toFixed(2));

    return {
      totalPlans,
      percentage,
      inactivePlans,
      activePlans,
    };
  }

  async getMyPlansStatistics(userId, long?: number): Promise<any> {
    const totalPlans = await this.plansModel.countDocuments({ author: userId });

    const duration = long ?? 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - duration);

    const plansLastNDays = await this.plansModel.countDocuments({
      createdAt: { $gte: sinceDate },
      author: userId,
    });

    const inactivePlans = await this.plansModel.countDocuments({
      isActive: false,
      author: userId,
    });

    const activePlans = totalPlans - inactivePlans;

    const percentage =
      totalPlans === 0
        ? 0
        : Number(((plansLastNDays / totalPlans) * 100).toFixed(2));

    return {
      totalPlans,
      percentage,
      inactivePlans,
      activePlans,
    };
  }

  async getPlansById(planId: any): Promise<any> {

    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const plan = await this.plansModel.findById(planId).populate('author');
    if (!plan) {
      throw new NotFoundException('Plan with this id not found');
    }

    const planOption = await this.optionsService.getAllOptionsOfPlans(plan._id);
    const planData = { ...plan.toObject(), options: planOption };

    return planData;
  }

  async createPlans(plan: CreatePlansDto, user: any): Promise<Plans> {
    const session = await this.plansModel.db.startSession();
    try {
      let created: Plans;
      await session.withTransaction(async () => {
        const [res] = await this.plansModel.create(
          [{ ...plan, author: user._id }],
          { session },
        );
        await this.optionsService.creatOptions(plan.options, res._id);
        created = res;
      });
      // this.fwService.createPaymentPlan({
      //   name: plan.title,
      //   amount: plan.price,
      //   currency: plan.currency,
      //   interval: plan.cycle,
      //   duration: 12,
      //   description: plan.author.toString(),
      // });
      return created!;
    } finally {
      session.endSession();
    }
  }

  async addSubscriber(data: any): Promise<any> {
    const dataBackup = structuredClone(data);
    let user: any = this.parseUserToObject(data);
    user.password = "12345678";
    try {
      let newUser = await this.authService.signUp(user, false);
      if (!newUser) {
        throw new NotFoundException('Unable to add this user');
      }

      const plan = await this.getPlansById(dataBackup.planId);
      if (!plan) {
        throw new NotFoundException('Plan not found');
      }
      console.log('addSubscriber - getPlansById : ', plan);


      const subscription = await this.subscriptionService.subscribe({
        userId: newUser.userData._id,
        receiverId: plan.author._id,
        planId: plan._id,
        quantity: 0,
        cycle: plan.cycle,
        startDate: dataBackup.subscriptionStartDate,
        endDate: dataBackup.subscriptionStartDate,
        status: false,
      });

      console.log('addSubscriber - subscribe : ', subscription);
      if (!subscription) {
        throw new NotFoundException('Unable to add this subscription');
      }

      return subscription;
    } catch (err) {
      console.log(err);
      throw new NotFoundException('Error: ' + err);
    }
  }

  async incrementSubscriberNumber(plansId: string): Promise<any> {
    return this.plansModel
      .findByIdAndUpdate(
        plansId,
        { $inc: { subscriberNumber: 1 } },
        { new: true },
      )
      .exec();
  }

  private parseUserToObject(data: any): any {
    const obj = data.toObject ? data.toObject() : data; // convert mongoose doc to object if needed
    delete obj.planId;
    delete obj.subscriptionStartDate;
    return obj;
  }

  async updateStatus(planId: any, userData): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const plan = await this.plansModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }


    if (String(plan.author) != String(userData._id) && !userData.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }

    const status = plan.isActive === false ? false : true;
    const updatedPlan = await this.plansModel.findByIdAndUpdate(
      planId,
      { isActive: !status },
      { new: true, runValidators: true },
    );
    if (!updatedPlan) {
      throw new NotFoundException('User not found');
    }

    return true;
  }

  async deletePlans(planId: string, userData): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }
    const plan = await this.plansModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    if (
      plan.author.toString() != userData._id.toString() &&
      !userData.isAdmin
    ) {
      throw new NotFoundException('Unauthorized');
    }
    await this.optionsService.deleteOptionsOfPlan(plan._id);
    return await this.plansModel.findByIdAndDelete(planId);
  }

  async updatePlans(user: any, planId, planData: UpdatePlansDto): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const plan = await this.plansModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.author != user._id && !user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    const resp = await this.plansModel.findByIdAndUpdate(planId, planData, {
      new: true,
      runValidators: true,
    });

    return resp;
  }

  async getAllActivePlanss(query: Query): Promise<Plans[]> {
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          title: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};
    const optionsList = await this.plansModel
      .find({ ...keyword, status: true })
      .limit(resPerPage)
      .skip(skip);
    return optionsList;
  }

  async getSubscriberList(planId: string, userData: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    if (!mongoose.Types.ObjectId.isValid(userData._id)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const plan: any = await this.plansModel.findById(planId);
    if (userData._id === plan.author || userData.isAdmin === true) {
      const subscriberList: any =
        await this.itemService.getAllItemOfPlans(planId);
      if (!subscriberList) {
        throw new NotFoundException('Event not found');
      }

      return subscriberList;
    } else {
      throw new NotFoundException('Unauthorized');
    }
  }

  async searchByTitle(query: Query): Promise<any[]> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          $or: [{ title: { $regex: query.keyword as string, $options: 'i' } }],
        }
      : {};

    // Find plans matching the keyword with pagination
    const plans = await this.plansModel
      .find({ ...keyword })
      .sort({ createdAt: -1 })
      .limit(resPerPage)
      .skip(skip)
      .lean();

    return plans as any[];
  }
}
