/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Body, Controller, Post } from '@nestjs/common';
import { EmailService } from './email.service';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('email')
@Controller('email')
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Post('welcome-account-creation')
  @ApiOperation({ summary: 'Send welcome email after account creation' })
  @ApiBody({
    schema: {
      example: {
        to: 'user@email.com',
        language: 'fr',
        userName: 'John Doe',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Welcome email sent.' })
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
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiBody({
    schema: {
      example: {
        to: 'user@email.com',
        language: 'fr',
        userName: 'John Doe',
        token: 'reset-token',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Password reset email sent.' })
  async sendResetPwd(@Body() body: any): Promise<any> {
    const toEmail = body.to;
    const language = body.language; // 'fr' || 'en'
    const userName = body.userName;
    const token = body.token;
    return this.emailService.sendResetPwd(toEmail, language, userName, token);
  }

  @Post('send-test')
  @ApiOperation({ summary: 'Send a test email' })
  @ApiBody({
    schema: {
      example: {
        to: 'user@email.com',
        subject: 'Test Subject',
        message: 'Hello, this is a test message.',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Test email sent.' })
  async sendEmail(@Body() body: any): Promise<any> {
    const toEmail = body.to;
    const subject = body.subject;
    const message = body.message;
    return this.emailService.sendEmail(toEmail, subject, message);
  }
}
