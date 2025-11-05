/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Query } from 'express-serve-static-core';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { CreateServicePaymentDto } from './create-service-payment.dto';
import { UpdateServicePaymentDto } from './update-service-payment.dto';
import { WhatsappService } from 'src/wa/whatsapp.service';
import { UserService } from 'src/user/user.service';
import { ServicePayment } from './service-payment.schema';

@Injectable()
export class ServicePaymentService {
  constructor(
    @InjectModel(ServicePayment.name)
    private serviceModel: mongoose.Model<ServicePayment>,
    private whatsappService: WhatsappService,
    private userService: UserService,
  ) {}

  async getServicePaymentsStatistic(): Promise<{
    subscribersNumber: number;
    pourcentage: number;
  }> {
    const subscribersNumber = await this.serviceModel.countDocuments();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const subscribersLast7Days = await this.serviceModel.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    const pourcentage =
      subscribersNumber === 0
        ? 0
        : Number(((subscribersLast7Days / subscribersNumber) * 100).toFixed(2));

    return { subscribersNumber, pourcentage };
  }

  /**
   * Calcule la date de fin d'abonnement en fonction du cycle et de la quantité
   * @param startDate Date de début de l'abonnement
   * @param cycle Cycle de l'abonnement (dayly, weekly, monthly, yearly)
   * @param quantity Nombre de cycles à ajouter
   * @returns Date de fin d'abonnement
   */
  calculateEndDate(startDate: Date, cycle: string, quantity: number): Date {
    const endDate = new Date(startDate);

    switch (cycle) {
      case 'dayly':
        endDate.setDate(endDate.getDate() + quantity);
        break;

      case 'weekly':
        endDate.setDate(endDate.getDate() + quantity * 7);
        break;

      case 'monthly':
        endDate.setMonth(endDate.getMonth() + quantity);
        break;

      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + quantity);
        break;

      default:
        throw new Error(`Cycle non supporté: ${cycle}`);
    }

    return endDate;
  }

  async createServicePayment(
    serviceData: CreateServicePaymentDto,
  ): Promise<ServicePayment> {


    const res = await this.serviceModel.create(serviceData);
    // console.log('(service service: createServicePayment) res: ', res);
    if (!res) {
      throw new NotFoundException('ServicePayment not created');
    }
    const service: any = await this.serviceModel
      .findById(res._id)
      .populate('userId')
      .populate('receiverId')
      .populate('serviceId');
      if (!service) {
        throw new NotFoundException('ServicePayment not found');
      }

    // this.whatsappService.sendNewSubscriberMessageForPlanAuthor(
    //   service.serviceId,
    //   service.receiverId,
    // );

    return res;
  }

  async getAllServicePayments(query: Query): Promise<ServicePayment[]> {
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
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);

    return optionsList;
  }

  async getAllActiveServicePayments(query: Query): Promise<ServicePayment[]> {
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

  async getServicePaymentById(serviceId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      throw new NotFoundException('Invalid service ID');
    }

    // Find the service by ID
    const service = await this.serviceModel
      .findById(serviceId)
      .populate('userId')
      .populate('receiverId')
      .populate('serviceId');
    if (!service) {
      throw new NotFoundException('User not found');
    }

    // Enrich service data with follower and following counts
    let serviceData: any = { ...service };
    serviceData = serviceData._doc;

    return serviceData;
  }

  async getServicePaymentByUserIdAndPlanId(
    userId: string,
    serviceId: string,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid service ID');
    }
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      throw new NotFoundException('Invalid service ID');
    }

    // Find the service by ID
    const service = await this.serviceModel
      .findOne({ userId: userId, serviceId: serviceId })
      .populate('userId')
      .populate('receiverId')
      .populate('serviceId');
    if (!service) {
      throw new NotFoundException('User not found');
    }

    // Enrich service data with follower and following counts
    let serviceData: any = { ...service };
    serviceData = serviceData._doc;

    return serviceData;
  }

  async verifyServicePayment(userId: string, planId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new NotFoundException('Invalid subscription ID');
    }
    const subscription = await this.serviceModel.findOne({
      userId: userId,
      planId: planId,
    });
    if (!subscription) {
      return { existingSubscription: false }; // 'Subscription not found' or expired;
    }
    return {
      existingSubscription: true,
      status: true,
      id: subscription._id,
    };
  }

  async deleteServicePayment(
    serviceId: string,
    userData: any,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      throw new NotFoundException('Invalid service ID');
    }

    const service: any =
      await this.serviceModel.findById(serviceId);
    if (userData._id === service.author || userData.isAdmin === true) {
      return await this.serviceModel.findByIdAndDelete(serviceId);
    } else {
      throw new NotFoundException('Unauthorized');
    }
  }

  async getServicePaymentList(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    try {
      const serviceList = await this.serviceModel
        .find({ userId })
        .populate('serviceId', 'title price cycle')
        .populate('receiverId', 'name email');

      return serviceList;
    } catch (error) {
      throw new NotFoundException(
        `Error fetching service list: ${error.message}`,
      );
    }
  }

  async getPayerList(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid subscriber ID');
    }

    try {
      const subscriberList: any = await this.serviceModel.find({
        receiverId: userId,
      });
      if (!subscriberList) {
        throw new NotFoundException('No subscriber found');
      }

      return subscriberList;
    } catch (e) {
      throw new NotFoundException(
        'Error to find subscriber list of user: ' + e,
      );
    }
  }

  async searchByTitle(query: Query): Promise<ServicePayment[]> {
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
    const services = await this.serviceModel
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);

    // Enrich user data with follower counts
    let serviceArray: any = [];
    for (const service of services) {
      let serviceData: any = { ...service };
      serviceData = serviceData._doc;
      serviceArray = [...serviceArray, serviceData];
    }

    return serviceArray;
  }

  // Obtenir les abonnements expirés
  async getExpiredServicePayments(): Promise<ServicePayment[]> {
    return await this.serviceModel.find({
      endDate: { $lt: new Date() },
      status: true,
    });
  }

  parseTransactionToServicePayment(transaction) {
    return {
      userId: transaction.senderId,
      receiverId: transaction.receiverId,
      serviceId: transaction.serviceId,
      quantity: Number(transaction.quantity),
    };
  }

  async getServicePaymentsOfService(serviceId: string): Promise<ServicePayment[]> {
    return await this.serviceModel.find({ serviceId }).populate('userId');
  }

  async getServicePaymentsOfUser(userId: string): Promise<ServicePayment[]> {
    return await this.serviceModel.find({ userId }).populate('serviceId');
  }
}
