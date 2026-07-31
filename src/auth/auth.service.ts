/* eslint-disable @typescript-eslint/no-unsafe-call */
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
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from 'src/user/create-user.dto';
import { JwtService } from '@nestjs/jwt';
import { RevokedToken } from 'src/revoked-token/revoked-token.schema';
import { EmailService } from 'src/email/email.service';
import { WhatsappService } from 'src/wa/whatsapp.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { parseUserAgent } from 'src/common/user-agent.util';
import { lookupIpLocation } from 'src/common/geoip.util';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>, // Injecting the Mongoose User model for database operations
    @InjectModel(RevokedToken.name)
    private revokedTokenModel: Model<RevokedToken>, // Injectez le modèle pour les tokens révoqués
    private jwtService: JwtService, // Injecting the JwtService for token generation
    private emailService: EmailService,
    @Inject(forwardRef(() => WhatsappService))
    private whatsappService: WhatsappService,
    private auditLogService: AuditLogService,
  ) { }

  /**
   * Handles user registration.
   * @param userData - Data transfer object containing user registration details.
   * @returns An object containing the created user and a JWT token.
   * @throws ConflictException if the email already exists.
   * @throws UnauthorizedException if user creation fails.
   */
  async signUp(
    userData: CreateUserDto,
    sendWelcomeEmail: boolean = true,
    sendWelcomeWhatsapp: boolean = true,
    sendCredentials: boolean = false): Promise<any> {
    try {
      let datas: any = { ...userData }; // Create a copy of userData to avoid mutation

      const autoAdminEmails = String(process.env.AUTO_ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

      if (
        process.env.ALLOW_AUTO_ADMIN_SIGNUP === 'true' &&
        autoAdminEmails.includes(String(datas.email || '').toLowerCase())
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
      let user: any = await this.userModel
        .findById(create._id)
        .populate('cityId')
        .populate('countryId');

      if (!user) {
        throw new UnauthorizedException('Email or password invalid or user already exist'); // Handle case where user creation fails
      }

      user = this.sanitizeUser(user); // Remove the resetPasswordToken from the response for security

      const userName = user.name ? user.name : user.firstName + ' ' + user.lastName;;

      sendWelcomeEmail ? this.emailService.sendWelcomeEmailAccountCreation(
        user.email,
        user.language,
        userName,
      ) : null;

      sendWelcomeWhatsapp ? this.whatsappService.sendWelcomeMessage(user, user.countryId.code) : null;

      if (sendWelcomeEmail || sendWelcomeWhatsapp) {
        void this.auditLogService.record({
          actorId: String(user._id),
          action: 'notification.welcome_sent',
          resourceType: 'user',
          resourceId: String(user._id),
          metadata: { email: sendWelcomeEmail, whatsapp: sendWelcomeWhatsapp },
        });
      }

      // Return the user data and a JWT token for authentication
      return { userData: user, token: this.jwtService.sign({ id: user._id }) };
    } catch (error) {
      if (error.code === 11000) {
        const duplicatedField = Object.keys(error?.keyPattern || {})[0] || '';
        if (duplicatedField === 'email') {
          throw new ConflictException('Email already exists');
        }
        if (duplicatedField === 'whatsapp') {
          throw new ConflictException('WhatsApp already exists');
        }
        throw new ConflictException('Duplicate value');
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
  private extractRequestMeta(req?: Request): { ip?: string; userAgent?: string } {
    if (!req) return {};
    const xff = req.headers?.['x-forwarded-for'];
    const ip = (typeof xff === 'string' && xff.length) ? xff.split(',')[0].trim() : (req.ip || req.connection?.remoteAddress);
    return { ip, userAgent: req.headers?.['user-agent'] };
  }

  async signIn(authData: any, req?: Request): Promise<any> {
    const { ip, userAgent } = this.extractRequestMeta(req);
    // Find the user by email and populate cityId and countryId
    let user: any;
    const loginType = String(authData?.type || 'email').toLowerCase();
    if (loginType === 'email') {
      user = await this.userModel
        .findOne({ email: authData.email })
        .populate('cityId')
        .populate('countryId');
    } else {
      const whatsappInput = String(authData?.whatsapp || '').trim();
      const whatsappDigits = whatsappInput.replace(/\D/g, '');
      const digitsPattern = whatsappDigits
        ? new RegExp(`^\\D*${whatsappDigits.split('').join('\\D*')}\\D*$`)
        : null;
      user = await this.userModel
        .findOne({
          $or: [
            { whatsapp: whatsappInput },
            { whatsapp: whatsappInput.replace(/\s+/g, '') },
            ...(digitsPattern ? [{ whatsapp: { $regex: digitsPattern } }] : []),
          ],
        })
        .populate('cityId')
        .populate('countryId');
    }

    if (!user) {
      this.auditLogService.record({
        action: 'auth.login_failed',
        resourceType: 'user',
        metadata: { reason: 'user_not_found', loginType, email: authData?.email, whatsapp: authData?.whatsapp ? '[REDACTED]' : undefined },
        method: 'POST',
        path: '/auth/signin',
        statusCode: 401,
      });
      throw new UnauthorizedException('Email or password invalid'); // Handle case where user is not found
    }

    if (user.isActive === false) {
      this.auditLogService.record({
        actorId: String(user._id),
        actorEmail: user.email,
        action: 'auth.login_failed',
        resourceType: 'user',
        resourceId: String(user._id),
        metadata: { reason: 'account_disabled' },
        method: 'POST',
        path: '/auth/signin',
        statusCode: 401,
      });
      throw new UnauthorizedException('Your account is disabled. Please contact technical support.'); // Handle case where user is not found
    }

    // Bruteforce: check if account is temporarily locked
    if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
      this.auditLogService.record({
        actorId: String(user._id),
        actorEmail: user.email,
        action: 'auth.login_blocked',
        resourceType: 'user',
        resourceId: String(user._id),
        metadata: { reason: 'temporary_lockout', lockoutUntil: user.lockoutUntil },
        method: 'POST',
        path: '/auth/signin',
        statusCode: 429,
      });
      throw new UnauthorizedException('Account temporarily locked due to too many failed attempts. Please try again later.');
    }

    // Compare the provided password with the hashed password in the database
    const isPwdMatched = await bcrypt.compare(authData.password, user.password);
    if (!isPwdMatched) {
      const attempts = (user.loginAttempts || 0) + 1;
      const lockoutUntil = attempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

      await this.userModel.findByIdAndUpdate(user._id, { loginAttempts: attempts, lockoutUntil });

      const ua = parseUserAgent(userAgent);
      const geo = lookupIpLocation(ip);
      this.auditLogService.record({
        actorId: String(user._id),
        actorEmail: user.email,
        action: 'auth.login_failed',
        resourceType: 'user',
        resourceId: String(user._id),
        metadata: {
          reason: 'wrong_password',
          attempt: attempts,
          maxAttempts: MAX_LOGIN_ATTEMPTS,
          ip,
          userAgent,
          browser: ua.browser,
          os: ua.os,
          device: ua.device,
          location: geo?.location,
        },
        method: 'POST',
        path: '/auth/signin',
        statusCode: 401,
        ip,
        userAgent,
      });

      if (lockoutUntil) {
        const attemptDate = new Date().toISOString();
        const userName = user.name ? user.name : `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

        // Email détaillé à l'admin
        const adminDetails = [
          `User: ${userName}`,
          `Email: ${user.email}`,
          `User ID: ${String(user._id)}`,
          `Account type: ${user.accountType || 'user'}`,
          `Role: ${user.isAdmin ? 'admin' : user.accountType || 'user'}`,
          ``,
          `Attempt date: ${attemptDate}`,
          `IP address: ${ip || 'Unknown'}`,
          `Location: ${geo?.location || 'Unknown'}`,
          `Browser: ${ua.browser}`,
          `Operating system: ${ua.os}`,
          `Device: ${ua.device}`,
          `User-Agent: ${userAgent || 'Unknown'}`,
          ``,
          `Failed attempts: ${attempts}/${MAX_LOGIN_ATTEMPTS}`,
          `Locked until: ${lockoutUntil.toISOString()}`,
          `Duration: ${LOCKOUT_DURATION_MS / 60000} minutes`,
        ].join('\n');

        void this.emailService.sendAlertEmail(
          `🔒 Brute-force detected: ${user.email}`,
          adminDetails,
        );

        // Email à l'utilisateur
        void this.emailService
          .sendEmail(
            user.email,
            '🔒 Compte temporairement verrouillé — DigiKuntz Payments',
            `Bonjour ${userName},\n\nNous avons détecté ${MAX_LOGIN_ATTEMPTS} tentatives de connexion échouées sur votre compte.\n\n` +
              `Pour votre sécurité, votre compte a été temporairement verrouillé jusqu'au ${lockoutUntil.toLocaleString()} ` +
              `(${LOCKOUT_DURATION_MS / 60000} minutes).\n\n` +
              `Si vous n'êtes pas à l'origine de ces tentatives, nous vous recommandons de changer votre mot de passe dès que le délai est écoulé.\n\n` +
              `Détails de la tentative :\n` +
              `- Date : ${attemptDate}\n` +
              `- IP : ${ip || 'Unknown'}\n` +
              `- Localisation : ${geo?.location || 'Unknown'}\n` +
              `- Navigateur : ${ua.browser}\n` +
              `- Système : ${ua.os}\n\n` +
              `L'équipe DigiKuntz Payments`,
          )
          .catch((error) =>
            console.warn('sendLockoutUserEmail failed:', error),
          );
      }

      throw new UnauthorizedException('Email or password invalid'); // Handle incorrect password
    }

    // Success — reset brute-force counter
    await this.userModel.findByIdAndUpdate(user._id, { loginAttempts: 0, lockoutUntil: null });

    user.password = ''; // Remove the password from the response for security
    user.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security

    this.auditLogService.record({
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: user.isAdmin ? 'admin' : user.accountType || 'user',
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user._id?.toString(),
      resourceLabel: user.email,
      method: 'POST',
      path: '/auth/signin',
      statusCode: 200,
    });

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

    const resetToken = this.generateResetToken(String(user._id));
    const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    user.resetPasswordToken = resetToken;
    user.resetPasswordTokenExpiresAt = resetExpiresAt;
    await user.save();

    // const resetPwdUrl = `;token=${resetToken}`;
    const resetPwdUrl = `${resetToken}`;

    await this.emailService.sendResetPwd(
      email,
      user.language,
      user.name ? user.name : user.firstName + ' ' + user.lastName,
      resetPwdUrl,
    );
    void this.whatsappService
      .sendPasswordResetMessage(user, resetPwdUrl)
      .catch((error) =>
        console.warn('sendPasswordResetMessage failed:', error),
      );

    void this.auditLogService.record({
      actorId: String(user._id),
      action: 'notification.password_reset_sent',
      resourceType: 'user',
      resourceId: String(user._id),
      metadata: { emailSent: true, whatsappSent: true },
    });

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
    user.mustChangePassword = false;
    user.resetPasswordToken = ''; // Clear the reset token
    user.resetPasswordTokenExpiresAt = null;
    await user.save();
    await this.revokedTokenModel.create({ token });
    void this.emailService.sendPasswordUpdatedEmail(user).catch((error) =>
      console.warn('sendPasswordUpdatedEmail failed:', error),
    );
    void this.whatsappService.sendPasswordUpdatedMessage(user).catch((error) =>
      console.warn('sendPasswordUpdatedMessage failed:', error),
    );

    void this.auditLogService.record({
      actorId: String(user._id),
      action: 'notification.password_updated_sent',
      resourceType: 'user',
      resourceId: String(user._id),
      metadata: { emailSent: true, whatsappSent: true, via: 'reset' },
    });

    return true;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      throw new BadRequestException('Invalid password');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPwdMatched = await bcrypt.compare(currentPassword, user.password);
    if (!isPwdMatched) {
      throw new UnauthorizedException('Current password invalid');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    void this.emailService.sendPasswordUpdatedEmail(user).catch((error) =>
      console.warn('sendPasswordUpdatedEmail failed:', error),
    );
    void this.whatsappService.sendPasswordUpdatedMessage(user).catch((error) =>
      console.warn('sendPasswordUpdatedMessage failed:', error),
    );

    void this.auditLogService.record({
      actorId: String(userId),
      action: 'notification.password_updated_sent',
      resourceType: 'user',
      resourceId: String(userId),
      metadata: { emailSent: true, whatsappSent: true, via: 'change' },
    });

    return true;
  }

  // token validation
  async verifyResetPwdToken(token: string): Promise<any> {
    const verify = await this.isTokenRevoked(token);
    if (verify === true) {
      throw new BadRequestException('Invalid or expired token');
    }

    let userId: string | undefined;
    try {
      const decoded = this.jwtService.verify(token);
      userId = decoded.id;
    } catch {
      const user = await this.userModel.findOne({
        resetPasswordToken: token,
        resetPasswordTokenExpiresAt: { $gt: new Date() },
      });
      if (!user) {
        throw new BadRequestException('Invalid or expired token');
      }
      userId = String(user._id);
    }

    return { userId };
  }

  private generateResetToken(userId: string): string {
    return this.jwtService.sign({ id: userId }, { expiresIn: '1h' });
  }

  private sanitizeUser(user: any): any {
    if (!user) return user;
    const obj = user.toObject ? user.toObject() : user; // convert mongoose doc to object if needed
    delete obj.password;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordTokenExpiresAt;
    delete obj.balance;
    return obj;
  }
}
