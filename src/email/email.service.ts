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
import { createEvent } from 'ics';
import { InjectModel } from '@nestjs/mongoose';
import { Email } from './email.schema';
import mongoose from 'mongoose';
import { SmtpService } from './smtp/smtp.service';
import { Query } from 'express-serve-static-core';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

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
    if (!this.isEmailValide(to)) return;
    const from = this.configService.get<string>('SMTP_USER');
    try {
      console.log('Sending email');
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html: message,
      });
      this.saveMail({ to, subject, from, status: true, body: message });
      return true;
    } catch (error) {
      console.error("Erreur lors de l'envoi du mail :", error);
      this.saveMail({ to, subject, from, status: false, body: message });
      throw error;
    }
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
        ? 'Bienvenue sur Digikuntz Payments'
        : 'Welcome to Digikuntz Payments';

    const templatePath = path.join(
      this.templateFolder,
      `${templateName}_${language}.hbs`,
    );

    const context = {
      frontUrl: this.configService.get<string>('FRONT_URL'),
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
        ? 'Digikuntz Payments: Souscription à la boite aux lettres'
        : 'Digikuntz Payments: Mailbox Subscription';

    const templatePath = path.join(
      this.templateFolder,
      `${templateName}_${language}.hbs`,
    );

    const context = {
      frontUrl: this.configService.get<string>('FRONT_URL'),
      userName,
    };

    console.log('Sending 00', templatePath, context);
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);
    const html = template(context);

    console.log('Sending 11');
    await this.proceedToSendEmail(toEmail, subject, html);
  }

  async proceedToSendEmail(to, subject, html): Promise<any> {
    if (!this.isEmailValide(to)) return;
    console.log(
      'Proceeding to send email',
      this.configService.get<string>('SMTP_USER'),
      to,
      subject,
    );
    // this.transporter = await this.getTransporterData();
    await this.transporter.sendMail({
      from: this.configService.get<string>('SMTP_USER'),
      to,
      subject,
      html,
    });
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

      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateSource);

      const context = {
        userName,
        resetPwdUrl: `${this.configService.get<string>('FRONT_URL')}/auth/new-password/${token}`,
      };

      const html = template(context);

      this.saveMail({ to: toEmail, subject, from, status: true, body: String(html) });
      await this.transporter.sendMail({
        from,
        to: toEmail,
        subject,
        html,
      });

      return true;
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

    const context = {
      userName,
      cover_img: plansData.imageUrl,
      plans_title: plansData.title,
      plans_subTitle: plansData.subTitle,
      plans_cycle: plansData.cycle,
      plans_description: this.cleanString(plansData.description),
      plans_url: `${this.configService.get<string>('FRONT_URL')}/plans/${plansData._id}_shared`,
    };

    const html = template(context);
    const icsAttachment = await this.generateIcsFile(event);

    // this.transporter = await this.getTransporterData();
    await this.transporter.sendMail({
      from: this.configService.get<string>('SMTP_USER'),
      to: user.email,
      subject,
      html,
      attachments: [
        {
          filename: icsAttachment.filename,
          content: icsAttachment.content,
          contentType: 'text/calendar',
        },
      ],
    });

    return true;
  }

  private generateIcsFile(
    event: any,
  ): Promise<{ filename: string; content: Buffer }> {
    return new Promise((resolve, reject) => {
      const eventDetails = {
        start: this.dateService.convertToIcsDate(event.eventData.dateStart),
        end: this.dateService.convertToIcsDate(event.eventData.dateEnd),
        title: event.eventData.title,
        description: this.cleanString(event.eventData.description),
        location: event.eventData.location,
        url: `${this.configService.get<string>('FRONT_URL')}/tabs/events/${event.eventData._id}_shared`,
        organizer: {
          name: 'Digikuntz Payment',
          email: this.configService.get<string>('SMTP_USER'),
        },
      };

      createEvent(eventDetails, (error, value) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            filename: 'digikuntz-payment.ics',
            content: Buffer.from(value),
          });
        }
      });
    });
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
    const okay = await this.emailModel.create({
      from: data.from,
      to: data.to,
      subject: data.subject,
      status: data.status,
      body: data.body || '',
    });
    console.log('saving email: ', okay);
    return okay;
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
