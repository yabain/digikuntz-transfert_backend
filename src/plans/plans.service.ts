/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, ForbiddenException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
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
import { EmailService } from 'src/email/email.service';
import { generateFileUrl } from '../multer.config';
import { randomBytes } from 'crypto';

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
    private emailService: EmailService,
  ) { }

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
      .populate('author', 'firstName lastName name email phone whatsapp accountType pictureUrl countryId cityId');
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

  async getPublicPlansList(userId: string): Promise<Plans[]> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const plansList = await this.plansModel
      .find({ author: userId })
      .populate('author', 'firstName lastName name email phone whatsapp accountType pictureUrl countryId cityId');
    if (!plansList) {
      return [];
    }

    const resp: any = [];
    for (const plan of plansList) {
      const planOption = await this.optionsService.getAllOptionsOfPlans(plan._id);
      const planData = { ...plan.toObject(), options: planOption };
      resp.push(planData);
    }

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

    const plan = await this.plansModel
      .findById(planId)
      .populate('author', 'firstName lastName name email phone whatsapp accountType pictureUrl countryId cityId');
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

  async addSubscriber(data: any, currentUser: any, userCreation: boolean = true, ): Promise<any> {
    const dataBackup = structuredClone(data);
    const selectedUserId = dataBackup.userId || dataBackup.existingUserId;
    let user: any = this.parseUserToObject(data);
    let newUser: any;
    try {
      const plan = await this.getPlansById(dataBackup.planId);
      if (!plan) {
        throw new NotFoundException('Plan not found');
      }

      const planAuthorId = plan.author?._id?.toString?.() || plan.author?.toString?.();
      if (planAuthorId !== currentUser?._id?.toString?.() && currentUser?.isAdmin !== true) {
        throw new ForbiddenException('Unauthorized');
      }

      if (selectedUserId) {
        newUser = { userData: await this.userService.getUserById(selectedUserId) };
        if (!newUser.userData) {
          throw new NotFoundException('User not found');
        }
        userCreation = false;
      } else if (userCreation) {
        const plainPassword = randomBytes(12).toString('base64url');
        user.password = plainPassword;
        user.mustChangePassword = true;
        newUser = await this.authService.signUp(user, true, true, false);
        if (!newUser) {
          throw new NotFoundException('Unable to add this user');
        }

        const createdUser = newUser.userData;
        const userName = createdUser.name || `${createdUser.firstName || ''} ${createdUser.lastName || ''}`.trim() || createdUser.email;
        void this.emailService.sendEmail(
          createdUser.email,
          'Vos identifiants de connexion - digiKUNTZ Payments',
          `<p>Bonjour ${userName},</p>
          <p>Votre compte a été créé sur <strong>digiKUNTZ Payments</strong>.</p>
          <p>Voici vos identifiants de connexion :</p>
          <ul>
            <li><strong>Email :</strong> ${createdUser.email}</li>
            <li><strong>Mot de passe :</strong> ${plainPassword}</li>
          </ul>
          <p>Nous vous recommandons de changer votre mot de passe après votre première connexion.</p>
          <p>Vous avez été assigné au plan : <strong>${plan.title}</strong>.</p>
          <p>Votre abonnement sera actif après paiement.</p>`
        );
      }

      const quantity = Number(dataBackup.quantity) || 1;

      const subscription = await this.subscriptionService.subscribe({
        userId: selectedUserId || newUser.userData._id,
        receiverId: plan.author._id,
        planId: plan._id,
        quantity,
        cycle: plan.cycle,
        startDate: dataBackup.subscriptionStartDate,
        endDate: this.calculateEndDate(dataBackup.subscriptionStartDate, plan.cycle, quantity),
        status: false,
      });

      if (!subscription) {
        throw new NotFoundException('Unable to add this subscription');
      }

      return subscription;
    } catch (err) {
      throw new NotFoundException('Error: ' + err);
    }
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
    delete obj.userId;
    delete obj.existingUserId;
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
      throw new ForbiddenException('Unauthorized');
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
      throw new ForbiddenException('Unauthorized');
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
      throw new ForbiddenException('Unauthorized');
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
      throw new ForbiddenException('Unauthorized');
    }
  }

  async updatePlanPicture(plansId: string, picture: Array<Express.Multer.File>, userData: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(plansId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const plan = await this.plansModel.findById(plansId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.author.toString() !== userData._id.toString() && !userData.isAdmin) {
      throw new ForbiddenException('Unauthorized');
    }

    const imageUrl = generateFileUrl(picture[0].filename);

    return this.plansModel.findByIdAndUpdate(
      plansId,
      { imageUrl },
      { new: true, runValidators: true },
    );
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
