/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import { DateService } from './date.service';
import { InjectModel } from '@nestjs/mongoose';
import { Email } from './email.schema';
import mongoose from 'mongoose';
import { SmtpService } from './smtp/smtp.service';
import { Query } from 'express-serve-static-core';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly frontUrl: string = 'https://payments.digikuntz.com';

  private readonly templateFolder = path.join(
    __dirname,
    '..',
    '..',
    'email',
    'templates',
  );

  constructor(
    @InjectModel(Email.name)
    private emailModel: mongoose.Model<Email>,
    private readonly configService: ConfigService,
    private dateService: DateService,
    private smtpService: SmtpService,
  ) {
    this.initializeTransporter();
  }

  async initializeTransporter() {
    const newMailSmtp = await this.getTransporterData();
    this.transporter = nodemailer.createTransport({
      host: newMailSmtp.smtpHost,
      port: newMailSmtp.smtpPort,
      secure: newMailSmtp.smtpSecure,
      auth: {
        user: newMailSmtp.smtpUser,
        pass: newMailSmtp.smtpPassword,
      },
    });
  }

  isEmailValide(email) {
    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regexEmail.test(email);
  }

  async getTransporterData(): Promise<any> {
    return await this.smtpService.getSmtpDataAndUpdate();
  }

  async getOutputMails(query: Query): Promise<any[]> {
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    // Define the keyword search criteria
    const keyword = query.keyword
      ? {
          $or: [
            { to: { $regex: query.keyword, $options: 'i' } },
            { subject: { $regex: query.keyword, $options: 'i' } },
          ],
        }
      : {};

    const list = await this.emailModel
      .find({ ...keyword })
      .sort({ createdAt: -1 })
      .limit(resPerPage)
      .skip(skip);

    return list;
  }

  async sendEmail(to: string, subject: string, message: string): Promise<any> {
    console.log('to email: ', to);
    return await this.proceedToSendEmail(to, subject, message);
  }

  async sendWelcomeEmailAccountCreation(
    toEmail: string,
    language: string,
    userName: string,
  ): Promise<any> {
    if (!this.isEmailValide(toEmail)) return;
    const templateName = 'welcome-email';
    const subject =
      language === 'fr'
        ? 'Bienvenue sur digiKUNTZ Payments'
        : 'Welcome to digiKUNTZ Payments';

    const templatePath = path.join(
      this.templateFolder,
      `${templateName}_${language}.hbs`,
    );

    const context = {
      frontUrl: this.configService.get<string>('FRONT_URL') || this.frontUrl,
      userName,
    };

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);
    const html = template(context);

    await this.proceedToSendEmail(toEmail, subject, html);
    return true;
  }

  async sendSubscriptionNewsletterEmail(
    toEmail: string,
    language: string,
    userName: string,
  ): Promise<void> {
    if (!this.isEmailValide(toEmail)) return;
    console.log('Sending subscription newsletter email');
    const templateName = 'newsletter-subscription';
    const subject =
      language === 'fr'
        ? 'digiKUNTZ Payments: Souscription à la boite aux lettres'
        : 'digiKUNTZ Payments: Mailbox Subscription';

    const templatePath = path.join(
      this.templateFolder,
      `${templateName}_${language}.hbs`,
    );

    const context = {
      frontUrl: this.configService.get<string>('FRONT_URL') || this.frontUrl,
      userName,
    };

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);
    const html = template(context);
    await this.proceedToSendEmail(toEmail, subject, html);
  }

  async proceedToSendEmail(to, subject, html): Promise<boolean> {
    if (!this.isEmailValide(to)) return false;
    const from = this.configService.get<string>('SMTP_USER');
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      this.saveMail({ to, subject, from, status: true, body: html });
      return true;
    } catch (error) {
      console.error("Erreur lors de l'envoi du mail :", error);
      this.saveMail({ to, subject, from, status: false, body: html });
      throw error;
    }
  }

  async sendResetPwd(
    toEmail: string,
    language: string,
    userName: string,
    token: string,
  ): Promise<boolean> {
    if (!this.isEmailValide(toEmail)) return false;
    const from = this.configService.get<string>('SMTP_USER');
    const subject =
      language === 'fr' ? 'Réinitialisation de Mot de Passe' : 'Password Reset';
    try {
      const templateName = 'reset-pwd';

      const templatePath = path.join(
        this.templateFolder,
        `${templateName}_${language}.hbs`,
      );
      const front =
        this.configService.get<string>('FRONT_URL') || this.frontUrl;

      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateSource);
      const resetPwdUrl = `${front}/auth/new-password/${token}`;

      const context = {
        userName,
        resetPwdUrl,
      };

      const html = template(context);
      return await this.proceedToSendEmail(toEmail, subject, html);
    } catch (error) {
      console.error(
        "Erreur lors de l'envoi du mail de réinitialisation :",
        error,
      );
      this.saveMail({ to: toEmail, subject, from, status: true, body: '' });
      return false;
    }
  }

  async sendPlansEmail(user: any, plansData: any): Promise<boolean> {
    const userName = user.name || `${user.firstName} ${user.lastName}`;
    const templateName = 'subscribe';
    const subject =
      user.language === 'fr'
        ? 'Abonnement: ' + plansData.title
        : 'Subscription: ' + plansData.title;

    const templatePath = path.join(
      this.templateFolder,
      `${templateName}_${user.language}.hbs`,
    );

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);
    const front = this.configService.get<string>('FRONT_URL') || this.frontUrl;

    const context = {
      userName,
      cover_img: plansData.imageUrl,
      plans_title: plansData.title,
      plans_subTitle: plansData.subTitle,
      plans_cycle: plansData.cycle,
      plans_description: this.cleanString(plansData.description),
      plans_url: `${front}/plans/${plansData._id}_shared`,
    };

    const html = template(context);

    return await this.proceedToSendEmail(user.email, subject, html);
  }

  async sendWhatsappAlert(
    toEmail: string,
    subject: string,
    templateName: string,
  ): Promise<any> {
    if (!this.isEmailValide(toEmail)) return;

    const templatePath = path.join(this.templateFolder, `${templateName}.hbs`);

    const context = {
      frontUrl: this.configService.get<string>('FRONT_URL') || this.frontUrl,
    };

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);
    const html = template(context);

    return await this.proceedToSendEmail(toEmail, subject, html);
  }

  cleanString(input: string): string {
    // Remove HTML tags using regex
    let result = input.replace(/<[^>]*>/g, '');
    // Remove \r, \n, and \t characters
    result = result.replace(/[\r\n\t]/g, '');
    // console.log('cleaned string: ', result);
    return result;
  }

  async saveMail(data) {
    return await this.emailModel.create({
      from: data.from,
      to: data.to,
      subject: data.subject,
      status: data.status,
      body: data.body || '',
    });
  }

  async findAllEmail(query): Promise<any[]> {
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    const keyword = query.keyword
      ? {
          to: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};
    const Subscribers = await this.emailModel
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);
    return Subscribers;
  }
}
