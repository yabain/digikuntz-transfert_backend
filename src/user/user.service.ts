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

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new user.
   * @param userData - The user data to create.
   * @returns The created user.
   * @throws ConflictException if the email already exists.
   */
  async creatUser(userData: CreateUserDto): Promise<User> {
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

      // Hash the user's password
      const hashedPwd = await bcrypt.hash(userData.password, 10);

      // Create the user in the database
      const user = await this.userModel.create({
        ...datas,
        password: hashedPwd,
      });

      // Remove the password from the returned user object for security
      user.password = '';
      user.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security

      return user;
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
  async getUserById(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    // Find the user by ID
    const user = await this.userModel
      .findById(userId)
      .populate('countryId')
      .populate('cityId');
    if (!user) {
      throw new NotFoundException('User not found');
    } else {
      user.password = '';
      user.resetPasswordToken = '';
    }

    // Enrich user data with follower and following counts
    let userData: any = { ...user };
    userData = userData._doc;

    return userData;
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

    // Update the user in the database
    const user = await this.userModel
      .findByIdAndUpdate(userId, userData, {
        new: true,
        runValidators: true,
      })
      .populate('countryId')
      .populate('cityId');

    if (!user) {
      throw new NotFoundException('User not found');
    } else {
      user.password = '';
      user.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
    }

    return user;
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
    } else {
      updatedUser.password = '';
      updatedUser.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
    }

    return updatedUser;
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
  async searchByName(query: Query): Promise<User[]> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    // Define the keyword search criteria
    const keyword = query.keyword
      ? {
          $or: [
            { name: { $regex: query.keyword, $options: 'i' } },
            { firstName: { $regex: query.keyword, $options: 'i' } },
            { lastName: { $regex: query.keyword, $options: 'i' } },
          ],
        }
      : {};

    // Find users matching the keyword with pagination
    const users = await this.userModel
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);

    // Enrich user data with follower counts
    let userArray: any = [];
    for (const user of users) {
      user.password = '';
      user.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
      let userData: any = { ...user };
      userData = userData._doc;
      userArray = [...userArray, userData];
    }

    return users;
  }

  /**
   * Search for users by email with optional keyword and pagination.
   * @param query - Query parameters for keyword search and pagination.
   * @returns A list of users matching the search criteria.
   */
  async searchByEmail(query: Query): Promise<User[]> {
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
      .limit(resPerPage)
      .skip(skip);

    return users;
  }

  /**
   * Get total number of users and the percentage of users registered in the last 7 days.
   * @returns An object with usersNumber and pourcentage.
   */
  async getUsersStats(): Promise<{ usersNumber: number; pourcentage: number }> {
    const usersNumber = await this.userModel.countDocuments();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const usersLast7Days = await this.userModel.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    const pourcentage =
      usersNumber === 0
        ? 0
        : Number(((usersLast7Days / usersNumber) * 100).toFixed(2));

    return { usersNumber, pourcentage };
  }

  async getAllUsers(): Promise<User[]> {
    const users = await this.userModel
      .find()
      .populate('countryId')
      .populate('cityId');

    // Remove sensitive information from each user
    users.forEach((user) => {
      user.password = '';
      user.resetPasswordToken = '';
    });

    return users;
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
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { active: user.active ? false : true },
        { new: true, runValidators: true },
      )
      .populate('cityId')
      .populate('countryId');

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    } else {
      updatedUser.password = '';
      updatedUser.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
    }
  }

  async updateAdminStatus(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    } else {
      user.password = '';
      user.resetPasswordToken = '';
    }
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { isAdmin: user.isAdmin ? false : true },
        { new: true, runValidators: true },
      )
      .populate('cityId')
      .populate('countryId');

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    } else {
      updatedUser.password = '';
      updatedUser.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
    }
  }

  async updateVerifiedStatus(userId: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException('User not found');
    } else {
      user.password = '';
      user.resetPasswordToken = '';
      }
      const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      { verified: user.verified ? false : true },
      { new: true, runValidators: true },
    )
    .populate('cityId')
    .populate('countryId');

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    } else {
      updatedUser.password = '';
      updatedUser.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
      }
  }
}
