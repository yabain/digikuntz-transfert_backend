/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Smtp, SmtpDocument } from './smtp.schema';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmtpService {
  constructor(
    @InjectModel(Smtp.name)
    private smtpModel: Model<SmtpDocument>,
    private readonly configService: ConfigService,
  ) {}

  async getSmtpData(): Promise<any> {
    const data = await this.smtpModel.find({});
    return data[0];
  }

  async getSmtpDataAndUpdate(): Promise<any> {
    const mailSmtp = await this.getSmtpData();
    let newMailSmtp: any;
    if (!mailSmtp) {
      newMailSmtp = this.resetSmtp();
    } else newMailSmtp = mailSmtp;

    return newMailSmtp;
  }

  async updateSmtpData(data: any): Promise<any>{
    const smtp: any = await this.smtpModel.find({});
    if (smtp.length > 0) {
      await this.smtpModel.findByIdAndUpdate({ _id: smtp[0]._id }, data);
    } else {
      await this.smtpModel.create(data);
    }
    return data;
  }

  async resetSmtp(): Promise<any> {
    const data = {
      smtpHost: this.configService.get<string>('SMTP_HOST'),
      smtpPort: this.configService.get<number>('SMTP_PORT'),
      smtpSecure: this.configService.get<boolean>('SMTP_SECURE'),
      smtpUser: this.configService.get<string>('SMTP_USER'),
      smtpPassword: this.configService.get<string>('SMTP_PASSWORD'),
      smtpEncription: this.configService.get<string>('SMTP_ENCRIPTION'),
      status: true,
    };
    return this.updateSmtpData({ ...data });
  }
}
