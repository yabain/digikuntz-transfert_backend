/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Query } from 'express-serve-static-core';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { OptionsServiceService } from './options-service/options-service.service';
import { CreateServiceDto } from './create-service.dto';
import { UpdateServiceDto } from './update-service.dto';
import { Service } from './service.schema';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { AuthService } from 'src/auth/auth.service';
import { WhatsappService } from 'src/wa/whatsapp.service';
import { UserService } from 'src/user/user.service';
import { ServicePaymentService } from './service-payment/service-payment.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ServiceService {
  constructor(
    @InjectModel(Service.name)
    private serviceModel: mongoose.Model<Service>,
    private optionsService: OptionsServiceService,
    private readonly configService: ConfigService,
    private fwService: FlutterwaveService,
    private authService: AuthService,
    private waService: WhatsappService,
    private userService: UserService,
    private servicePaymentService: ServicePaymentService
  ) {}

  private sanitizeUser(user: any): any {
    if (!user) return user;
    const obj = user.toObject ? user.toObject() : user; // convert mongoose doc to object if needed
    delete obj.password;
    delete obj.resetPasswordToken;
    delete obj.balance;
    return obj;
  }

  async getAllService(query: Query): Promise<Service[]> {
    const resPerPage = 50;
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
    const serviceList = await this.serviceModel
      .find({ ...keyword })
      .populate('author')
      .limit(resPerPage)
      .skip(skip);

    const resp: any = [];
    for (const plan of serviceList) {
      const planOption = await this.optionsService.getAllOptionsOfService(
        plan._id,
      );
      const planData = { ...plan.toObject(), options: planOption };
      resp.push(planData);
    }
    return resp;
  }

  async getServiceList(userId: string): Promise<Service[]> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const serviceList = await this.serviceModel
      .find({ author: userId })
      .populate('author');
    if (!serviceList) {
      return [];
    }

    const resp: any = [];
    for (const plan of serviceList) {
      const planOption = await this.optionsService.getAllOptionsOfService(
        plan._id,
      );
      const planData = { ...plan.toObject(), options: planOption };
      resp.push(planData);
    }

    // console.log('user plan list', resp);
    return resp;
  }

  async getServiceStatistics(long?: number): Promise<any> {
    const totalService = await this.serviceModel.countDocuments();

    const duration = long ?? 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - duration);

    const serviceLastNDays = await this.serviceModel.countDocuments({
      createdAt: { $gte: sinceDate },
    });

    const inactiveService = await this.serviceModel.countDocuments({
      isActive: false,
    });

    const activeService = totalService - inactiveService;

    const pourcentage =
      totalService === 0
        ? 0
        : Number(((serviceLastNDays / totalService) * 100).toFixed(2));

    return {
      totalService,
      pourcentage,
      inactiveService,
      activeService,
    };
  }

  async getMyServiceStatistics(userId, long?: number): Promise<any> {
    const totalService = await this.serviceModel.countDocuments({ author: userId });

    const duration = long ?? 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - duration);

    const serviceLastNDays = await this.serviceModel.countDocuments({
      createdAt: { $gte: sinceDate },
      author: userId,
    });

    const inactiveService = await this.serviceModel.countDocuments({
      isActive: false,
      author: userId,
    });

    const activeService = totalService - inactiveService;

    const pourcentage =
      totalService === 0
        ? 0
        : Number(((serviceLastNDays / totalService) * 100).toFixed(2));

    return {
      totalService,
      pourcentage,
      inactiveService,
      activeService,
    };
  }

  async getServiceById(planId: any): Promise<any> {
    console.log('planId: ', planId);
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const plan = await this.serviceModel.findById(planId).populate('author');
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const planOption = await this.optionsService.getAllOptionsOfService(plan._id);
    const planData = { ...plan.toObject(), options: planOption };

    return planData;
  }

  async creatService(plan: CreateServiceDto, user: any): Promise<Service> {
    const session = await this.serviceModel.db.startSession();
    try {
      let created: Service;
      await session.withTransaction(async () => {
        const [res] = await this.serviceModel.create(
          [{ ...plan, author: user._id }],
          { session },
        );
        await this.optionsService.creatOptions(plan.options, res._id);
        created = res;
      });
      return created!;
    } finally {
      session.endSession();
    }
  }

  async updateServicePicture(
    serviceId: any,
    files: Array<Express.Multer.File>,
  ): Promise<any> {
    // Check if the service ID is valid
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      throw new NotFoundException('Invalid service');
    }
  
    // Find the service by ID
    const service = await this.serviceModel.findById(serviceId);
    if (!service) {
      throw new NotFoundException('Service not found');
    }
  
    // Generate URLs for the uploaded files
    const fileUrls = files.map((file) => {
      return `${this.configService.get<string>('BACK_URL')}/assets/images/${file.filename}`;
    });
  
    // Update the service's image in the database
    const updatedService = await this.serviceModel
      .findByIdAndUpdate(
        serviceId,
        { imageUrl: fileUrls[0] },
        { new: true, runValidators: true },
      )
      .populate('author');
  
    if (!updatedService) {
      throw new NotFoundException('Service not found');
    }
  
    return updatedService;
  }


  private sanitizeForUser(data: any): any {
    const obj = data.toObject ? data.toObject() : data; // convert mongoose doc to object if needed
    delete obj.planId;
    delete obj.subscriptionStartDate;
    return obj;
  }

  async updateStatus(planId: any, userData): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const plan = await this.serviceModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    console.log('plan: ', plan);

    if (String(plan.author) != String(userData._id) && !userData.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }

    const status = plan.isActive === false ? false : true;
    const updatedPlan = await this.serviceModel.findByIdAndUpdate(
      planId,
      { isActive: !status },
      { new: true, runValidators: true },
    );
    if (!updatedPlan) {
      throw new NotFoundException('User not found');
    }

    return true;
  }

  async deleteService(planId: string, userData): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }
    const plan = await this.serviceModel.findById(planId);
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
    return await this.serviceModel.findByIdAndDelete(planId);
  }

  async updateService(user: any, planId, planData: UpdateServiceDto): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const plan = await this.serviceModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.author != user._id && !user.isAdmin) {
      throw new NotFoundException('Unauthorized');
    }
    const resp = await this.serviceModel.findByIdAndUpdate(planId, planData, {
      new: true,
      runValidators: true,
    });

    return resp;
  }

  async getAllActiveServices(query: Query): Promise<Service[]> {
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
    const optionsList = await this.serviceModel
      .find({ ...keyword, status: true })
      .limit(resPerPage)
      .skip(skip);
    return optionsList;
  }

  async searchByTitle(query: Query): Promise<Service[]> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    // Define the keyword search criteria
    const keyword = query.keyword
      ? {
          $or: [{ title: { $regex: query.keyword, $options: 'i' } }],
        }
      : {};

    // Find users matching the keyword with pagination
    const service = await this.serviceModel
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);

    // Enrich user data with follower counts
    let planArray: any = [];
    for (const plan of service) {
      let planData: any = { ...plan };
      planData = planData._doc;
      planArray = [...planArray, planData];
    }
    return planArray;
  }
}
