/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('init-whatsapp')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe) // Validate the incoming data
  async initWhatsapp(@Req() req) {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.whatsappService.initWhatsapp();
  }

  @Get('get-qr-code')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe) // Validate the incoming data
  async getQr(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    const qr = await this.whatsappService.getCurrentQr();
    if (!qr) {
      throw new NotFoundException('QR code not found');
    }
    return qr;
  }

  @Get('get-client-status')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe) // Validate the incoming data
  async getWhatsappClientStatus(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.whatsappService.getWhatsappClientStatus();
  }

  @Get('refresh-qr-code')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async refreshQr(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    const qr = await this.whatsappService.refreshQr();
    if (!qr) {
      throw new NotFoundException('QR code not found');
    }
    return { qr };
  }

  @Post('send')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async send(@Body() body: { to: string; message: string; code: string }) {
    console.log('body: ', body);
    return this.whatsappService.sendMessage(body.to, body.message, body.code);
  }

  @Post('welcome-message')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async welcomeMessage(@Req() req) {
    return this.whatsappService.welcomeMessage(req.user._id, false);
  }

  @Post('welcome-message0')
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  async welcomeMessage0(@Body() body: { userId: string }) {
    return this.whatsappService.welcomeMessage(body.userId, false);
  }

  @Put('update-contact')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateSystemContact(
    @Req() req,
    @Body() body: { code: string; contact: string },
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.whatsappService.updateSystemContact(body);
  }

  @Post('disconnect')
  // @UseGuards(AuthGuard('jwt'))
  // @UsePipes(ValidationPipe)
  async disconnect(@Req() req): Promise<any> {
    console.log('disconnect');
    // if (!req.user.isAdmin) {
    //   throw new NotFoundException('Unautorised');
    // }
    return this.whatsappService.disconnect();
  }
}
