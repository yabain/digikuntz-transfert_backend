/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './user.schema';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    private readonly configService: ConfigService,
    private cacheService: CacheService,
  ) { }

  private sanitizeUser(user: any): any {
    if (!user) return user;
    const obj = user.toObject ? user.toObject() : user; // convert mongoose doc to object if needed
    delete obj.password;
    delete obj.resetPasswordToken;
    delete obj.balance;
    return obj;
  }

  async getAllUsers(query: any): Promise<any> {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Requête optimisée sans populate
    // const users = await this.userModel.find({})
    //   .select('firstName lastName name email pictureUrl isActive isAdmin accountType whatsapp verified createdAt')
    //   .populate('countryId', 'name')
    //   .populate('cityId', 'name')
    //   .sort({ createdAt: -1 })
    //   .skip(skip)
    //   .limit(limit)
    //   .lean();

    // Parallel execution
    const [total, totalActive, adminers, users, personal] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ isActive: true }),
      this.userModel.countDocuments({ isAdmin: true }),
      this.userModel.find({})
        .select('firstName lastName name email pictureUrl isActive isAdmin accountType whatsapp verified createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('countryId', 'name flagUrl')
        .populate('cityId', 'name')
        .lean(),
        this.userModel.countDocuments({ accountType: 'personal' }),
    ]);


    return {
      data: users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page * limit < total,
        totalActive,
        totalInactive: total - totalActive,
        adminers,
        totalPersonal: personal,
        totalOrganisation: total - personal
      },
    };
  }

  async searchToAllUsers(query: Query): Promise<any[]> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
        $or: [
          { name: { $regex: query.keyword as string, $options: 'i' } },
          { firstName: { $regex: query.keyword as string, $options: 'i' } },
          { lastName: { $regex: query.keyword as string, $options: 'i' } },
        ],
      }
      : {};

    // Find users matching the keyword with pagination
    const users = await this.userModel
      .find({ ...keyword })
      .select('-password -resetPasswordToken -balance')
      .limit(resPerPage)
      .skip(skip)
      .sort({ createdAt: -1 })
      .lean();

    return users;
  }
  /**
   * Create a new user.
   * @param userData - The user data to create.
   * @returns The created user.
   * @throws ConflictException if the email already exists.
   */
  async creatUser(userData: CreateUserDto): Promise<any> {
    try {
      let datas: any = { ...userData };
      // Grant VIP and verified status to specific emails
      if (
        datas.email === 'flambel55@gmail.com' ||
        datas.email === 'f.sanou@yaba-in.com'
      ) {
        datas = Object.assign(datas, { verified: true });
        datas = Object.assign(datas, { vip: true });
      }
      datas = Object.assign(datas, { active: true });
      datas = Object.assign(datas, { sole: 0 });

      // Hash the user's password
      const hashedPwd = await bcrypt.hash(userData.password, 10);

      // Create the user in the database
      const user = await this.userModel.create({
        ...datas,
        password: hashedPwd,
      });

      return this.sanitizeUser(user);
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  /**
   * Find a user by ID and enrich the data with follower and following counts.
   * @param userId - The ID of the user to retrieve.
   * @returns The user data with follower and following counts.
   * @throws NotFoundException if the user ID is invalid or the user is not found.
   */
  async getUserById(userId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    try {
      // Vérifier le cache
      const cachedUser = await this.cacheService.getUserCache(userId);
      if (cachedUser) {
        return cachedUser;
      }

      const user = await this.userModel
        .findById(userId)
        .select('-password -resetPasswordToken -balance')
        .populate('countryId')
        .populate('cityId')
        .lean();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Mettre en cache avec logique conditionnelle
      await this.cacheService.setUserCache(userId, user);
      console.log('userData: ', user);
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException('Error retrieving user');
    }
  }

  /**
   * Update a user by ID.
   * @param userId - The ID of the user to update.
   * @param userData - The updated user data.
   * @returns The updated user.
   * @throws NotFoundException if the user ID is invalid.
   */
  async updateUser(userId: string, userData: UpdateUserDto): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user');
    }

    try {
      const user = await this.userModel
        .findByIdAndUpdate(userId, userData, {
          new: true,
          runValidators: true,
        })
        .select('-password -resetPasswordToken -balance')
        .populate('countryId', 'name')
        .populate('cityId', 'name')
        .lean();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Invalider le cache
      await this.cacheService.invalidateUserCache(userId);

      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException('Error updating user');
    }
  }

  /**
   * Update the profile picture of a user.
   * @param req - The request object containing the authenticated user.
   * @param files - The uploaded files (e.g., profile picture).
   * @returns The updated user data.
   * @throws NotFoundException if the user ID is invalid or the user is not found.
   */
  async updateUserPicture(
    req: any,
    files: Array<Express.Multer.File>,
  ): Promise<any> {
    // Check if the user ID is valid
    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
      throw new NotFoundException('Invalid user');
    }

    // Find the user by ID
    const user = await this.userModel.findById(req.user._id);
    if (!user) {
      throw new NotFoundException('User not found');
    } else {
      user.password = '';
      user.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
    }

    // Generate URLs for the uploaded files
    const fileUrls = files.map((file) => {
      return `${this.configService.get<string>('BACK_URL')}/assets/images/${file.filename}`;
    });

    // Update the user's profile picture in the database
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        req.user._id,
        { pictureUrl: fileUrls[0] },
        { new: true, runValidators: true },
      )
      .populate('cityId')
      .populate('countryId');

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    // Invalider le cache
    await this.cacheService.invalidateUserCache(req.user._id);

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Delete a user by ID.
   * @param userId - The ID of the user to delete.
   * @returns The result of the deletion operation.
   */
  async deleteUser(userId: string): Promise<any> {
    return await this.userModel.findByIdAndDelete(userId);
  }

  /**
   * Search for users by name with optional keyword and pagination.
   * @param query - Query parameters for keyword search and pagination.
   * @returns A list of users matching the search criteria.
   */
  async searchByName(query: Query): Promise<any[]> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
        $or: [
          { name: { $regex: query.keyword as string, $options: 'i' } },
          { firstName: { $regex: query.keyword as string, $options: 'i' } },
          { lastName: { $regex: query.keyword as string, $options: 'i' } },
        ],
      }
      : {};

    // Find users matching the keyword with pagination
    const users = await this.userModel
      .find({ ...keyword })
      .select('-password -resetPasswordToken -balance')
      .sort({ createdAt: -1 })
      .limit(resPerPage)
      .skip(skip)
      .lean();

    return users;
  }

  /**
   * Search for users by email with optional keyword and pagination.
   * @param query - Query parameters for keyword search and pagination.
   * @returns A list of users matching the search criteria.
   */
  async searchByEmail(query: Query): Promise<any[]> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    // Define the keyword search criteria
    const keyword = query.keyword
      ? {
        email: {
          $regex: query.keyword,
          $options: 'i',
        },
      }
      : {};

    // Find users matching the keyword with pagination
    const users = await this.userModel
      .find({ ...keyword })
      .select('-password -resetPasswordToken -balance')
      .populate('countryId', 'name')
      .populate('cityId', 'name')
      .sort({ createdAt: -1 })
      .limit(resPerPage)
      .skip(skip)
      .lean();

    return users;
  }

  /**
   * Get total number of users and the percentage of users registered in the last 7 days.
   * @returns An object with usersNumber and pourcentage.
   */
  async getUsersStatistic(): Promise<any> {
    const usersNumber = await this.userModel.countDocuments();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const usersLast7Days = await this.userModel.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    const inactiveUsers = await this.userModel.countDocuments({
      isActive: false,
    });
    const activeUser = usersNumber - inactiveUsers;

    const pourcentage =
      usersNumber === 0
        ? 0
        : Number(((usersLast7Days / usersNumber) * 100).toFixed(2));

    return { usersNumber, pourcentage, activeUser, inactiveUsers };
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return await this.userModel
      .findOne({ email })
      .populate('countryId')
      .populate('cityId');
  }

  async updateStatus(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    console.log('updating status: ', user);

    const status = user.isActive === true ? false : true
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { isActive: status },
        { new: true, runValidators: true },
      )
      console.log('status updated: ', updatedUser);

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    // Invalider le cache
    await this.cacheService.invalidateUserCache(userId);

    return this.sanitizeUser(updatedUser);
  }

  async updateAdminStatus(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const status = user.isAdmin === true ? false : true
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { isAdmin: status },
        { new: true, runValidators: true },
      )

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    // Invalider le cache
    await this.cacheService.invalidateUserCache(userId);

    return this.sanitizeUser(updatedUser);
  }

  async updateVerifiedStatus(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const status = user.verified === true ? false : true
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { verified: status },
        { new: true, runValidators: true },
      )

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    // Invalider le cache
    await this.cacheService.invalidateUserCache(userId);

    return this.sanitizeUser(updatedUser);
  }

  async getUserStatsByMonth(currentUser): Promise<any[]> {
    const result: any[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const [personal, organisation] = await Promise.all([
        this.userModel.countDocuments({
          accountType: 'personal',
          createdAt: { $gte: date, $lt: nextMonth }
        }),
        this.userModel.countDocuments({
          accountType: 'organisation',
          createdAt: { $gte: date, $lt: nextMonth }
        })
      ]);

      let language: string = ''
      if (currentUser.language === 'fr') language = 'fr-FR'
      else language = 'en-US'

      result.push({
        month: date.toLocaleString(language, { month: 'long', year: 'numeric' }),
        personal,
        organisation
      });
    }
    return result;
  }

  async getUserWithCurrency(userId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(userId)
      .select('-password -resetPasswordToken -balance')
      .populate('countryId', 'name currency')
      .lean();
      
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}