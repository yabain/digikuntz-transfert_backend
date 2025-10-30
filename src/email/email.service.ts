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
  private alertEmail: any;
  private transporter: nodemailer.Transporter;
  private readonly frontUrl: string = 'https://payments.digikuntz.com';
  private readonly templateFolder = path.join(
    process.cwd(),
    'src',
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

  getAlertDestination(){
    const emails = this.configService.get<string>('ALERT_EMAIL') ? this.configService.get<string>('ALERT_EMAIL') : undefined;
    this.alertEmail = emails ? emails.split(',') : ['flambel55@gmail.com', 'f.sanou@yaba-in.com'];
    return this.alertEmail;
  }

  async initializeTransporter() {
    const newMailSmtp = await this.getTransporterData();
    this.transporter = nodemailer.createTransport({
      host: newMailSmtp.smtpHost || 'smtppro.zoho.com',
      port: newMailSmtp.smtpPort,
      secure: newMailSmtp.smtpSecure,
      // port: 587,       // STARTTLS
      // secure: false,   // false = STARTTLS, pas SSL direct
      auth: {
        user: newMailSmtp.smtpUser,
        pass: newMailSmtp.smtpPassword,
      },
      tls: {
        rejectUnauthorized: true,
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
    if (!this.isEmailValide(to)) return false;
    const resp: any = await this.proceedToSendEmail(to, subject, message);
    return resp;
  }

  /**
   * Send email alert
   * @param to string[] - destinataires
   * @param subject string - suject
   * @param message string - message
   */
  async sendAlertEmail(
    subject: string,
    message?: string,
    url?: string
  ) {
    const to = this.getAlertDestination();
    try {
      for (let i = 0; i < to.length; i++) {
        const recipients = to[i];
        if(url) await this.proceedToSendEmail(recipients, subject, message || '', url);
        else await this.proceedToSendEmail(recipients, subject, message || '');
        console.log(`✅ Alert "${subject}" sent to : ${recipients}`);
      }
    } catch (error) {
      console.error(`❌ Error to send  an alert email to:  "${subject}"`, error);
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

    await this.proceedToSendEmail(toEmail, subject, html, 'Création de compte');
    return true;
  }

  async sendSubscriptionNewsletterEmail(
    toEmail: string,
    language: string,
    userName: string,
  ): Promise<void> {
    if (!this.isEmailValide(toEmail)) return;
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
    await this.proceedToSendEmail(
      toEmail,
      subject,
      html,
      'Souscription à la boite aux lettres',
    );
  }

  async proceedToSendEmail(to, subject, html, url?: string): Promise<boolean> {
    if (!this.isEmailValide(to)) return false;
    const from = this.configService.get<string>('SMTP_USER');
    try {
      const resp: any = await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      if (url) {
        this.saveMail({ to, subject, from, status: true, body: url });
      } else this.saveMail({ to, subject, from, status: true, body: html });
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'envoi du mail :', error);
      if (url) {
        this.saveMail({ to, subject, from, status: false, body: url });
      } else this.saveMail({
        to,
        subject,
        from,
        status: false,
        body: error + '  \n ' + html,
      });
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
      return await this.proceedToSendEmail(toEmail, subject, html, resetPwdUrl);
    } catch (error) {
      console.error(
        'Erreur lors de l\'envoi du mail de réinitialisation :',
        error,
      );
      this.saveMail({ to: toEmail, subject, from, status: false, body: error });
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

    return await this.proceedToSendEmail(
      user.email,
      subject,
      html,
      'Subscription: ' + context.plans_url,
    );
  }

  async sendWhatsappAlert(
    subject: string,
    templateName: string,
  ): Promise<any> {
    const templatePath = path.join(this.templateFolder, `${templateName}.hbs`);

    const context = {
      frontUrl: this.configService.get<string>('FRONT_URL') || this.frontUrl,
    };

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);
    const html = template(context);

    return await this.sendAlertEmail(subject, html, 'Whatsapp Alert: ' + subject);
  }

  cleanString(input: string): string {
    let result = input.replace(/<[^>]*>/g, '');
    result = result.replace(/[\r\n\t]/g, '');
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
