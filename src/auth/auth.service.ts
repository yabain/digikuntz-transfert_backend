/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from 'src/user/create-user.dto';
import { JwtService } from '@nestjs/jwt';
import { RevokedToken } from 'src/revoked-token/revoked-token.schema';
import { EmailService } from 'src/email/email.service';
// import { WhatsappService } from 'src/whatsapp/whatsapp.service';
import { WhatsappQr } from 'src/whatsapp/whatsapp-qr.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>, // Injecting the Mongoose User model for database operations
    @InjectModel(RevokedToken.name)
    private revokedTokenModel: Model<RevokedToken>, // Injectez le modèle pour les tokens révoqués
    private jwtService: JwtService, // Injecting the JwtService for token generation
    private emailService: EmailService,
    // private whatsappService: WhatsappService,
  ) {}

  /**
   * Handles user registration.
   * @param userData - Data transfer object containing user registration details.
   * @returns An object containing the created user and a JWT token.
   * @throws ConflictException if the email already exists.
   * @throws UnauthorizedException if user creation fails.
   */
  async signUp(userData: CreateUserDto): Promise<any> {
    try {
      let datas: any = { ...userData }; // Create a copy of userData to avoid mutation

      // Special logic for specific admin or VIP emails
      if (
        datas.email === 'flambel55@gmail.com' ||
        datas.email === 'f.sanou@yaba-in.com' ||
        datas.email === 'contact@yaba-in.com' ||
        datas.email === 'admin@yabi.cm' ||
        datas.email === 'contact@yabi.cm'
      ) {
        datas = Object.assign(datas, {
          verified: true,
          vip: true,
          isAdmin: true,
        }); // Assign admin/VIP privileges
      }

      datas = Object.assign(datas, { isActive: true }); // Set the user as active by default
      const hashedPwd = await bcrypt.hash(userData.password, 10); // Hash the password for security
      const create: any = await this.userModel.create({
        ...datas,
        password: hashedPwd, // Save the hashed password in the database
      });

      // Fetch the newly created user with populated fields (cityId and countryId)
      const user = await this.userModel
        .findById(create._id)
        .populate('cityId')
        .populate('countryId');

      if (!user) {
        throw new UnauthorizedException('Email or password invalid'); // Handle case where user creation fails
      }

      user.password = '';
      user.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security

      let userName: string = '';
      if (user.firstName && user.firstName != '' && user.firstName != null) {
        userName = user.firstName + ' ' + user.lastName;
      } else userName = user.name;
      this.emailService.sendWelcomeEmailAccountCreation(
        user.email,
        user.language,
        userName,
      );

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      // this.whatsappService.welcomeMessage(user._id, false);
      // Return the user data and a JWT token for authentication
      return { userData: user, token: this.jwtService.sign({ id: user._id }) };
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Email already exists'); // Handle duplicate email error
      }
      throw error; // Propagate other errors
    }
  }

  /**
   * Handles user login.
   * @param authData - Object containing email and password for authentication.
   * @returns An object containing the authenticated user and a JWT token.
   * @throws UnauthorizedException if email or password is invalid.
   */
  async signIn(authData: any): Promise<any> {
    // Find the user by email and populate cityId and countryId
    const user = await this.userModel
      .findOne({ email: authData.email })
      .populate('cityId')
      .populate('countryId');

    if (!user) {
      throw new UnauthorizedException('Email or password invalid'); // Handle case where user is not found
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Your account is disabled. Please contact technical support.'); // Handle case where user is not found
    }

    // Compare the provided password with the hashed password in the database
    const isPwdMatched = await bcrypt.compare(authData.password, user.password);
    if (!isPwdMatched) {
      throw new UnauthorizedException('Email or password invalid'); // Handle incorrect password
    }

    user.password = ''; // Remove the password from the response for security
    user.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security

    // Return the user data and a JWT token for authentication
    return { userData: user, token: this.jwtService.sign({ id: user._id }) };
  }

  /**
   * Logs the user out by adding their token to the blacklist.
   * @param token - The JWT token to revoke.
   * @returns A success message.
   */
  async logout(token: string): Promise<boolean> {
    // Check if the token is already revoked
    const isRevoked = await this.revokedTokenModel.findOne({ token });
    if (isRevoked) {
      throw new UnauthorizedException('Token already revoked');
    }

    // Add the token to the blacklist
    await this.revokedTokenModel.create({ token });

    return true;
  }

  /**
   * Checks if a token is revoked.
   * @param token - The JWT token to check.
   * @returns True if the token is revoked, otherwise False.
   */
  async isTokenRevoked(token: string): Promise<boolean> {
    const revokedToken = await this.revokedTokenModel.findOne({ token });
    return !!revokedToken;
  }

  /**
   * Sends a password reset email.
   * @param email - The user's email address.
   * @returns a success message.
   */
  async requestPasswordReset(email: string): Promise<boolean> {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const resetToken = this.jwtService.sign(
      { id: user._id },
      { expiresIn: '1h' },
    );

    user.resetPasswordToken = resetToken;
    await user.save();

    // const resetPwdUrl = `;token=${resetToken}`;
    const resetPwdUrl = `${resetToken}`;

    await this.emailService.sendResetPwd(
      email,
      user.language,
      user.name ? user.name : user.firstName + ' ' + user.lastName,
      resetPwdUrl,
    );

    return true;
  }

  /**
   * Resets the user's password.
   * @param token - The password reset token.
   * @param newPassword - The new password.
   * @returns A success message.
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    let userId: any = await this.verifyResetPwdToken(token);
    userId = userId.userId;

    // Find the user and update the password
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hashedPwd = await bcrypt.hash(newPassword, 10);
    user.password = hashedPwd;
    user.resetPasswordToken = ''; // Clear the reset token
    await user.save();
    await this.revokedTokenModel.create({ token });
    return true;
  }

  // token validation
  async verifyResetPwdToken(token: string): Promise<any> {
    let userId: string;
    try {
      const decoded = this.jwtService.verify(token);
      userId = decoded.id;
    } catch (error) {
      throw new BadRequestException('Invalid or expired token');
    }
    const verify = await this.isTokenRevoked(token);
    if (verify === true) {
      throw new BadRequestException('Invalid or expired token');
    }

    return { userId };
  }
}
