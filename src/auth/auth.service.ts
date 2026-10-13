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
import { ProspectsService } from 'src/prospects/prospects.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import { parseUserAgent } from 'src/common/user-agent.util';
import { lookupIpLocation } from 'src/common/geoip.util';
import { SystemService } from 'src/system/system.service';
import { google } from 'googleapis';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 heure de blocage
const FAILED_ATTEMPT_WINDOW_MS = 60 * 60 * 1000; // Fenêtre d'1 heure pour compter les tentatives

const TWO_FACTOR_CODE_DURATION_MS = 5 * 60 * 1000;
const MAX_TWO_FACTOR_ATTEMPTS = 5;

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
    private prospectsService: ProspectsService,
    private systemService: SystemService,
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

      // Supprimer le prospect correspondant (même email/phone) après création du compte
      try {
        await this.prospectsService.removeMatchingProspect(user.email, user.phone);
      } catch {
        // la suppression du prospect ne doit pas bloquer la création du compte
      }

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

      // 2FA obligatoire pour les comptes admin et organisation
      if (await this.requiresTwoFactor(user)) {
        const challengeToken = await this.sendTwoFactorCode(user);
        void this.auditLogService.record({
          actorId: String(user._id),
          action: 'auth.two_factor_challenge_sent',
          resourceType: 'user',
          resourceId: String(user._id),
          metadata: { via: 'signup' },
        });
        return { requiresTwoFactor: true, challengeToken };
      }

      // Return the user data and a JWT token for authentication
      return { userData: user, token: this.jwtService.sign({ id: user._id }) };
    } catch (error) {
      if (error.code === 11000) {
        // Determine which field is duplicated
        const duplicatedField = Object.keys(error.keyPattern)[0];
        const fieldValue = error.keyValue[duplicatedField];

        if (duplicatedField === 'email') {
          throw new ConflictException(
            `L'email ${fieldValue} est déjà utilisé. Veuillez utiliser un autre email.`,
          );
        }

        if (duplicatedField === 'whatsapp') {
          throw new ConflictException(
            `Le numéro de téléphone ${fieldValue} est déjà enregistré. Veuillez en utiliser un autre.`,
          );
        }

        throw new ConflictException(
          'Unable to register. Please check your details or try to sign in.',
        );
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
      const now = new Date();

      // Fenêtre glissante d'une heure : si la première tentative est
      // vieille de plus d'1h, on repart à zéro.
      const firstAttempt = user.firstFailedAttemptAt
        ? new Date(user.firstFailedAttemptAt)
        : null;
      // Si le verrouillage est déjà expiré (en attente du cron), on repart
      // aussi à zéro pour ne pas re-verrouiller immédiatement.
      const lockExpired =
        user.lockoutUntil && new Date(user.lockoutUntil) <= now;

      let attempts = (user.loginAttempts || 0) + 1;
      let firstFailedAttemptAt = user.firstFailedAttemptAt || now;

      if (
        lockExpired ||
        (firstAttempt &&
          now.getTime() - firstAttempt.getTime() >= FAILED_ATTEMPT_WINDOW_MS)
      ) {
        attempts = 1;
        firstFailedAttemptAt = now;
      }

      // Verrouillage uniquement si les 5 échecs sont dans la même heure
      const lockoutUntil =
        attempts >= MAX_LOGIN_ATTEMPTS
          ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
          : null;

      const updateData: any = {
        loginAttempts: lockoutUntil ? 0 : attempts,
        firstFailedAttemptAt: lockoutUntil ? null : firstFailedAttemptAt,
        lockoutUntil,
      };

      await this.userModel.findByIdAndUpdate(user._id, updateData);

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
        const attemptDate = now.toISOString();
        const userName = user.name ? user.name : `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

        const lockDetails = {
          userName,
          email: user.email,
          userId: String(user._id),
          accountType: user.accountType || 'user',
          role: user.isAdmin ? 'admin' : user.accountType || 'user',
          attemptDate,
          ip: ip || 'Unknown',
          location: geo?.location || 'Unknown',
          browser: ua.browser || 'Unknown',
          os: ua.os || 'Unknown',
          device: ua.device || 'Unknown',
          userAgent: userAgent || 'Unknown',
          attempts: `${MAX_LOGIN_ATTEMPTS}/${MAX_LOGIN_ATTEMPTS}`,
          lockedUntil: lockoutUntil.toISOString(),
          duration: `${LOCKOUT_DURATION_MS / 60000} minutes`,
        };

        // Email détaillé à l'admin (template HTML présentable)
        void this.emailService.sendAdminBruteForceAlert(lockDetails);

        // Email à l'utilisateur (template HTML présentable)
        void this.emailService
          .sendAccountLockedEmail(
            user.email,
            user.language,
            {
              userName,
              lockedUntil: lockoutUntil.toISOString(),
              duration: `${LOCKOUT_DURATION_MS / 60000} minutes`,
              attemptDate,
              ip: ip || 'Unknown',
              location: geo?.location || 'Unknown',
              browser: ua.browser || 'Unknown',
              os: ua.os || 'Unknown',
            },
          )
          .catch((error) =>
            console.warn('sendLockoutUserEmail failed:', error),
          );
      }

      throw new UnauthorizedException('Email or password invalid'); // Handle incorrect password
    }

    // Success — reset brute-force counter
    await this.userModel.findByIdAndUpdate(user._id, {
      loginAttempts: 0,
      lockoutUntil: null,
      firstFailedAttemptAt: null,
    });

    // 2FA obligatoire pour les comptes admin et organisation
    if (await this.requiresTwoFactor(user)) {
      const challengeToken = await this.sendTwoFactorCode(user);
      this.auditLogService.record({
        actorId: String(user._id),
        actorEmail: user.email,
        action: 'auth.two_factor_challenge_sent',
        resourceType: 'user',
        resourceId: String(user._id),
        metadata: { via: 'signin', ip, location: lookupIpLocation(ip)?.location },
        method: 'POST',
        path: '/auth/signin',
        statusCode: 200,
        ip,
      });
      return { requiresTwoFactor: true, challengeToken };
    }

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
   * Anti-enumeration: returns the same success response whether or not the
   * email exists (never reveals if an account exists).
   * @param email - The user's email address.
   * @returns a success message.
   */
  async requestPasswordReset(email: string): Promise<boolean> {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      return true;
    }

    const resetToken = this.generateResetToken();
    const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    user.resetPasswordToken = this.hashResetToken(resetToken);
    user.resetPasswordTokenExpiresAt = resetExpiresAt;
    await user.save();

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
    user.resetPasswordToken = ''; // Clear the reset token (single-use)
    user.resetPasswordTokenExpiresAt = null;
    user.sessionInvalidatedAt = new Date(); // Invalidate all existing sessions
    user.loginAttempts = 0;
    user.lockoutUntil = null;
    user.firstFailedAttemptAt = null;
    await user.save();
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
    user.sessionInvalidatedAt = new Date(); // Invalidate all existing sessions
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

  /**
   * Détermine si le compte exige une double authentification.
   * Vérifie le paramètre système global, puis les règles par rôle.
   */
  private async requiresTwoFactor(user: any): Promise<boolean> {
    // Vérifier le paramètre système global (toggle 2FA système)
    const securitySettings = await this.systemService.getSecuritySettingsWithKey();
    if (securitySettings.twoFactorEnabled === false) {
      return false;
    }
    // Règles par rôle : admin et organisation forcent la 2FA
    return (
      user.twoFactorEnabled === true ||
      user.isAdmin === true ||
      user.accountType === 'organisation'
    );
  }

  /**
   * Génère un code 2FA à 6 chiffres (stocké en hash bcrypt), l'envoie par
   * email et retourne un challenge JWT court lié à l'utilisateur.
   */
  private async sendTwoFactorCode(user: any): Promise<string> {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const hash = await bcrypt.hash(code, 10);

    user.twoFactorCode = hash;
    user.twoFactorCodeExpiresAt = new Date(Date.now() + TWO_FACTOR_CODE_DURATION_MS);
    user.twoFactorAttempts = 0;
    await user.save();

    const userName = user.name
      ? user.name
      : `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

    void this.emailService
      .send2FACode(user.email, user.language, userName, code)
      .catch((error) => console.warn('send2FACode failed:', error));

    return this.jwtService.sign(
      { id: String(user._id), purpose: '2fa' },
      { expiresIn: '10m' },
    );
  }

  /**
   * Vérifie le code 2FA saisi par l'utilisateur après une première étape réussie
   * (mot de passe correct). En cas de succès, un token d'accès JWT est émis.
   */
  async verifyTwoFactor(challengeToken: string, code: string): Promise<any> {
    if (!challengeToken || !code) {
      throw new BadRequestException('Invalid request');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(challengeToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired challenge');
    }
    if (payload?.purpose !== '2fa' || !payload?.id) {
      throw new UnauthorizedException('Invalid or expired challenge');
    }

    const user: any = await this.userModel
      .findById(payload.id)
      .populate('cityId')
      .populate('countryId');
    if (!user || !user.twoFactorCode || !user.twoFactorCodeExpiresAt) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (new Date(user.twoFactorCodeExpiresAt) < new Date()) {
      throw new UnauthorizedException('Code expired. Please sign in again.');
    }

    const isMatch = await bcrypt.compare(code, user.twoFactorCode);
    if (!isMatch) {
      const attempts = (user.twoFactorAttempts || 0) + 1;
      if (attempts >= MAX_TWO_FACTOR_ATTEMPTS) {
        await this.userModel.findByIdAndUpdate(user._id, {
          twoFactorCode: '',
          twoFactorCodeExpiresAt: null,
          twoFactorAttempts: 0,
        });
        this.auditLogService.record({
          actorId: String(user._id),
          actorEmail: user.email,
          action: 'auth.two_factor_blocked',
          resourceType: 'user',
          resourceId: String(user._id),
          metadata: { reason: 'max_attempts', attempts: MAX_TWO_FACTOR_ATTEMPTS },
        });
        throw new UnauthorizedException(
          'Too many invalid codes. Please sign in again.',
        );
      }
      await this.userModel.findByIdAndUpdate(user._id, {
        twoFactorAttempts: attempts,
      });
      throw new UnauthorizedException('Invalid code');
    }

    // Succès : purge du code et émission du token d'accès
    await this.userModel.findByIdAndUpdate(user._id, {
      twoFactorCode: '',
      twoFactorCodeExpiresAt: null,
      twoFactorAttempts: 0,
    });

    user.twoFactorCode = '';
    user.twoFactorCodeExpiresAt = null;
    user.password = '';
    user.resetPasswordToken = '';

    this.auditLogService.record({
      actorId: String(user._id),
      actorEmail: user.email,
      actorRole: user.isAdmin ? 'admin' : user.accountType || 'user',
      action: 'auth.login',
      resourceType: 'user',
      resourceId: String(user._id),
      resourceLabel: user.email,
      method: 'POST',
      path: '/auth/verify-2fa',
      statusCode: 200,
    });

    return { userData: user, token: this.jwtService.sign({ id: user._id }) };
  }

  /**
   * Google Login - vérifie le token ID Google, crée ou retrouve l'utilisateur.
   * Ne déclenche PAS de 2FA (Google est considéré comme second facteur).
   */
  async googleLogin(idToken: string): Promise<any> {
    // Vérifier que la connexion Google est activée au niveau système
    const securitySettings = await this.systemService.getSecuritySettingsWithKey();
    if (securitySettings.googleLoginEnabled === false) {
      throw new UnauthorizedException('La connexion Google est désactivée');
    }

    const googleClientId = securitySettings.googleClientId || process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      throw new UnauthorizedException('Configuration Google manquante');
    }

    const oauth2Client = new google.auth.OAuth2();
    let ticket;
    try {
      ticket = await oauth2Client.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
    } catch (error) {
      throw new UnauthorizedException('Token Google invalide');
    }

    const payload = ticket.getPayload();
    if (!payload?.email_verified || !payload?.email) {
      throw new UnauthorizedException('Email Google non vérifié ou absent');
    }

    const { email, sub: googleId, name, picture, given_name, family_name } = payload;

    // Rechercher ou créer l'utilisateur
    let user = await this.userModel
      .findOne({ email })
      .populate('cityId')
      .populate('countryId');

    if (!user) {
      // Créer un nouvel utilisateur
      const baseName = name || email.split('@')[0];
      const username = baseName.toLowerCase().replace(/\s+/g, '') + '_' + googleId.slice(-4);
      user = await this.userModel.create({
        email,
        googleId,
        firstName: given_name || baseName,
        lastName: family_name || '',
        name: name || baseName,
        username,
        pictureUrl: picture,
        isActive: true,
        verified: true,
        accountType: 'personal',
      });
      // TODO: envoyer email de bienvenue
    } else {
      // Mettre à jour googleId si absent
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
      // Mettre à jour la photo si fournie
      if (picture && !user.pictureUrl) {
        user.pictureUrl = picture;
        await user.save();
      }
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      throw new UnauthorizedException('Compte désactivé');
    }

    // Google login contourne la 2FA (Google = second facteur)
    user.password = '';
    user.resetPasswordToken = '';

    this.auditLogService.record({
      actorId: String(user._id),
      actorEmail: user.email,
      actorRole: user.isAdmin ? 'admin' : user.accountType || 'user',
      action: 'auth.login',
      resourceType: 'user',
      resourceId: String(user._id),
      resourceLabel: user.email,
      method: 'POST',
      path: '/auth/google',
      statusCode: 200,
      metadata: { via: 'google', googleId },
    });

    return { userData: this.sanitizeUser(user), token: this.jwtService.sign({ id: user._id }) };
  }

  // token validation
  async verifyResetPwdToken(token: string): Promise<any> {
    if (!token || typeof token !== 'string' || token.length === 0) {
      throw new BadRequestException('Invalid or expired token');
    }

    // Recherche par hash stocké en base (mot de passe jamais exposé)
    const hash = this.hashResetToken(token);
    const user = await this.userModel.findOne({
      resetPasswordToken: hash,
      resetPasswordTokenExpiresAt: { $gt: new Date() },
    });
    if (user) {
      return { userId: String(user._id) };
    }

    // Rétro-compatibilité: les tokens JWT émis avant le durcissement
    if (token.includes('.')) {
      try {
        const decoded = this.jwtService.verify(token);
        if (decoded?.id) {
          const legacy = await this.userModel.findOne({
            resetPasswordToken: token,
            resetPasswordTokenExpiresAt: { $gt: new Date() },
          });
          if (legacy && String(legacy._id) === String(decoded.id)) {
            return { userId: String(legacy._id) };
          }
        }
      } catch {
        // token invalide ou expiré -> on retombe sur le message générique
      }
    }

    throw new BadRequestException('Invalid or expired token');
  }

  /**
   * Generate a cryptographically safe single-use reset token.
   * The raw token is sent to the user; only its SHA-256 hash is stored in the DB.
   */
  private generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashResetToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
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
