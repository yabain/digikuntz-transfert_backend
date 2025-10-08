/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import {
  Body,
  Controller,
  Get,
  ForbiddenException,
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('init-whatsapp')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize WhatsApp client (admin only)' })
  @ApiResponse({ status: 200, description: 'WhatsApp client initialized.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async initWhatsapp(@Req() req) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorized');
    }
    return this.whatsappService.initWhatsapp();
  }

  @Get('get-qr-code')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current WhatsApp QR code (admin only)' })
  @ApiResponse({ status: 200, description: 'QR code returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getQr(@Req() req): Promise<any> {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorized');
    }
    const qr = await this.whatsappService.getCurrentQr();
    if (!qr) {
      throw new NotFoundException('QR code not found');
    }
    return qr;
  }

  @Get('get-client-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get WhatsApp client status (admin only)' })
  @ApiResponse({ status: 200, description: 'Client status returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getWhatsappClientStatus(@Req() req): Promise<any> {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorized');
    }
    return this.whatsappService.getWhatsappClientStatus();
  }

  @Get('refresh-qr-code')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh WhatsApp QR code (admin only)' })
  @ApiResponse({ status: 200, description: 'QR code refreshed and returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async refreshQr(@Req() req): Promise<any> {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorized');
    }
    const qr = await this.whatsappService.refreshQr();
    if (!qr) {
      throw new NotFoundException('QR code not found');
    }
    return qr;
  }

  @Post('send')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a WhatsApp message' })
  @ApiBody({
    schema: {
      example: {
        to: '+237690000000',
        message: 'Hello from API',
        code: '237',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Message sent.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async send(@Body() body: { to: string; message: string; code?: string }) {
    return this.whatsappService.sendMessage(body.to, body.message, body.code);
  }

  @Post('welcome-message')
  @ApiOperation({
    summary: 'Send a WhatsApp welcome message to a user by ID (dev only)',
  })
  @ApiBody({
    schema: {
      example: {
        userId: 'userId',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Welcome message sent.' })
  async welcomeMessage0(@Body() userData: any) {
    return this.whatsappService.welcomeMessage(userData);
  }

  @Put('update-contact')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update WhatsApp system contact (admin only)' })
  @ApiBody({
    schema: {
      example: {
        code: '237',
        contact: '+237690000000',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'System contact updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateSystemContact(
    @Req() req,
    @Body() body: { code: string; contact: string },
  ): Promise<any> {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorized');
    }
    return this.whatsappService.updateSystemContact(body);
  }

  @Post('disconnect')
  @ApiOperation({ summary: 'Disconnect WhatsApp client (dev only)' })
  @ApiResponse({ status: 200, description: 'WhatsApp client disconnected.' })
  async disconnect(@Req() req): Promise<any> {
    return this.whatsappService.disconnect();
  }
}
