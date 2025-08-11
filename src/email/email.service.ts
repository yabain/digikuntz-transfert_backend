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
    private readonly configService: ConfigService,
    private dateService: DateService,
  ) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: this.configService.get<boolean>('SMTP_SECURE'), // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });
  }

  isEmailValide(email) {
    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regexEmail.test(email);
  }

  async sendEmail(
    toEmail: string,
    subject: string,
    message: string,
  ): Promise<void> {
    if (!this.isEmailValide(toEmail)) return;
    try {
      console.log('Sending email');
      message = '<p>' + message + '</p>';
      const from = this.configService.get<string>('SMTP_USER');
      await this.transporter.sendMail({
        from,
        to: toEmail,
        subject,
        html: message,
      });
    } catch (error) {
      console.error("Erreur lors de l'envoi du mail :", error);
      throw error;
    }
  }

  async sendWelcomeEmailAccountCreation(
    toEmail: string,
    language: string,
    userName: string,
  ): Promise<void> {
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
    await this.transporter.sendMail({
      from: this.configService.get<string>('SMTP_USER'),
      to,
      subject,
      html,
    });
  }
  // async sendResetPwd(
  //   toEmail: string,
  //   language: string,
  //   userName: string,
  //   token: string,
  // ): Promise<boolean> {
  //   const templateName = 'reset-pwd';
  //   const subject =
  //     language === 'fr' ? 'Réinitialisation de Mot de Passe' : 'Password Reset';

  //   const templatePath = path.join(
  //     this.templateFolder,
  //     `${templateName}_${language}.hbs`,
  //   );

  //   const templateSource = fs.readFileSync(templatePath, 'utf8');
  //   const template = handlebars.compile(templateSource);

  //   const context = {
  //     userName,
  //     resetPwdUrl: `${this.configService.get<string>('FRONT_URL')}/auth-screen/new-password${token}`,
  //   };

  //   const html = template(context);

  //   await this.transporter.sendMail({
  //     from: this.configService.get<string>('SMTP_USER'),
  //     to: toEmail,
  //     subject,
  //     html,
  //   });

  //   return true;
  // }
  async sendResetPwd(
    toEmail: string,
    language: string,
    userName: string,
    token: string,
  ): Promise<boolean> {
    if (!this.isEmailValide(toEmail)) return false;
    try {
      const templateName = 'reset-pwd';
      const subject =
        language === 'fr'
          ? 'Réinitialisation de Mot de Passe'
          : 'Password Reset';

      const templatePath = path.join(
        this.templateFolder,
        `${templateName}_${language}.hbs`,
      );

      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateSource);

      const context = {
        userName,
        resetPwdUrl: `${this.configService.get<string>('FRONT_URL')}/auth-screen/new-password${token}`,
      };

      const html = template(context);

      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_USER'),
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
      return false;
    }
  }

  async sendEventParticipationEmail(user: any, event: any): Promise<boolean> {
    const userName = user.name || `${user.firstName} ${user.lastName}`;
    const templateName = 'participate-free-event';
    const subject =
      user.language === 'fr'
        ? 'Évènement: ' + event.eventData.title
        : 'Event: ' + event.eventData.title;

    const templatePath = path.join(
      this.templateFolder,
      `${templateName}_${user.language}.hbs`,
    );

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);

    const context = {
      userName,
      cover_img: event.eventData.cover,
      event_title: event.eventData.title,
      event_category: event.categoryData.name,
      event_price: event.eventData.paid === true ? event.price : 'FREE',
      event_description: this.cleanString(event.eventData.description),
      event_country: event.countryData.name,
      event_city: event.cityData.name,
      event_location: event.eventData.location,
      event_start:
        this.dateService.formatDate(
          event.eventData.dateStart,
          'long',
          user.language,
        ) +
        ' - ' +
        this.dateService.formatTime(event.eventData.dateStart, user.language),
      event_end:
        this.dateService.formatDate(
          event.eventData.dateEnd,
          'long',
          user.language,
        ) +
        ' - ' +
        this.dateService.formatTime(event.eventData.dateEnd, user.language),
      event_url: `${this.configService.get<string>('FRONT_URL')}/tabs/events/${event.eventData._id}_shared`,
    };

    const html = template(context);
    const icsAttachment = await this.generateIcsFile(event);

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
          name: 'Yabi Events',
          email: this.configService.get<string>('SMTP_USER'),
        },
      };

      createEvent(eventDetails, (error, value) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            filename: 'YabiEvents.ics',
            content: Buffer.from(value),
          });
        }
      });
    });
  }

  // private async updateMail(
  //   mail: string,
  //   status: boolean = true,
  // ): Promise<boolean> {
  //   try {
  //     await this.mailModel.findOneAndUpdate(
  //       {},
  //       { status, mail },
  //       { upsert: true, new: true },
  //     );
  //     return true;
  //   } catch (err) {
  //     console.error(`QR status update failed: ${err.message}`);
  //     return false;
  //   }
  // }

  // public async getMail(): Promise<any> {
  //   return this.mailModel.findOne({});
  // }

  // public getStatus() {
  //   return true;
  // }

  /**
   * Remove all HTML tags and occurrences of \r, \n, and \t from a string.
   * @param input The input string to clean.
   * @returns The cleaned string.
   */
  cleanString(input: string): string {
    // Remove HTML tags using regex
    let result = input.replace(/<[^>]*>/g, '');
    // Remove \r, \n, and \t characters
    result = result.replace(/[\r\n\t]/g, '');
    // console.log('cleaned string: ', result);
    return result;
  }
}
