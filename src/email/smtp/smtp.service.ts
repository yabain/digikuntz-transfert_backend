/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Smtp, SmtpDocument } from './smtp.schema';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CryptService } from 'src/dev/crypt.service';

@Injectable()
export class SmtpService {
  constructor(
    @InjectModel(Smtp.name)
    private smtpModel: Model<SmtpDocument>,
    private readonly configService: ConfigService,
    private readonly cryptService: CryptService,
  ) {}

  async getSmtpData(): Promise<any> {
    const data = await this.smtpModel.find({});
    if (!data || data.length === 0) return null;
    const doc = data[0].toObject();
    if (doc.smtpUser) {
      try {
        doc.smtpUser = this.cryptService.decryptWithPassphrase(doc.smtpUser);
      } catch (e) {
        doc.smtpUser = doc.smtpUser;
      }
    }
    if (doc.smtpPassword) {
      try {
        doc.smtpPassword = this.cryptService.decryptWithPassphrase(doc.smtpPassword);
      } catch (e) {
        doc.smtpPassword = doc.smtpPassword;
      }
    }
    return doc;
  }

  async getSmtpDataAndUpdate(): Promise<any> {
    const mailSmtp = await this.getSmtpData();
    let newMailSmtp: any;
    if (!mailSmtp) {
      newMailSmtp = await this.resetSmtp();
    } else newMailSmtp = mailSmtp;

    return newMailSmtp;
  }

  async updateSmtpData(data: any): Promise<any>{
    const smtp: any = await this.smtpModel.find({});
    const payload = { ...data };
    if (payload.smtpUser) {
      payload.smtpUser = this.cryptService.encryptWithPassphrase(payload.smtpUser);
    }
    if (payload.smtpPassword) {
      payload.smtpPassword = this.cryptService.encryptWithPassphrase(payload.smtpPassword);
    }
    if (smtp.length > 0) {
      await this.smtpModel.findByIdAndUpdate({ _id: smtp[0]._id }, payload);
    } else {
      await this.smtpModel.create(payload);
    }
    return this.getSmtpData();
  }

  async resetSmtp(): Promise<any> {
    const data = {
      smtpHost: this.configService.get<string>('SMTP_HOST'),
      smtpPort: this.configService.get<number>('SMTP_PORT'),
      smtpSecure: this.configService.get<boolean>('SMTP_SECURE'),
      smtpUser: this.configService.get<string>('SMTP_USER'),
      smtpPassword: this.configService.get<string>('SMTP_PASSWORD'),
      smtpEncription: this.configService.get<string>('SMTP_ENCRIPTION'),
      emailForAlert: this.configService.get<string>('ALERT_EMAIL'),
      status: true,
    };
    const payload: any = { ...data };
    if (payload.smtpUser) {
      payload.smtpUser = this.cryptService.encryptWithPassphrase(payload.smtpUser);
    }
    if (payload.smtpPassword) {
      payload.smtpPassword = this.cryptService.encryptWithPassphrase(payload.smtpPassword);
    }
    return this.updateSmtpData(payload);
  }
}
