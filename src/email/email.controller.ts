/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { EmailService } from './email.service';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';
import { queryObjects } from 'node:v8';

@ApiTags('email')
@Controller('email')
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Get()
  @ApiOperation({ summary: 'Get all email log' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of subscribers returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async findAllEmail(@Query() query: ExpressQuery, @Req() req): Promise<any[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.emailService.findAllEmail(query);
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

  @Get('output')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  getOutputMails(@Query() query: ExpressQuery, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.emailService.getOutputMails(query);
  }
}
