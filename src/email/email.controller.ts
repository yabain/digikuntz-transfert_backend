/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Body, Controller, Post } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Post('welcome-account-creation')
  async sendWelcomeEmailAccountCreation(@Body() body: any): Promise<any> {
    const toEmail = body.to;
    const language = body.language; // 'fr' || 'en'
    const userName = body.userName;
    return this.emailService.sendWelcomeEmailAccountCreation(
      toEmail,
      language,
      userName,
    );
  }

  @Post('send-reset-pwd-email')
  async sendResetPwd(@Body() body: any): Promise<any> {
    const toEmail = body.to;
    const language = body.language; // 'fr' || 'en'
    const userName = body.userName;
    const token = body.token;
    return this.emailService.sendResetPwd(toEmail, language, userName, token);
  }

  @Post('send-test')
  async sendEmail(@Body() body: any): Promise<any> {
    const toEmail = body.to;
    const subject = body.subject; // 'fr' || 'en'
    const message = body.message;
    return this.emailService.sendEmail(toEmail, subject, message);
  }
}
