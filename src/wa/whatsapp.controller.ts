/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { SendTextDto } from './dto/send-text.dto';
import { SendMediaDto } from './dto/send-media.dto';
import { SendTemplateDto } from './dto/send-template.dto';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('whatsapp')
@Controller('wa')
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  /** QR courant (null si déjà authentifié) */
  @Get('qr')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current WhatsApp QR code' })
  @ApiResponse({ status: 200, description: 'Current QR/state response.' })
  @UseGuards(AuthGuard('jwt'))
  async qr(@Req() req) {
    this.assertAdmin(req);
    return this.wa.getQr();
  }

  /** État courant (ready + state) */
  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, description: 'Current WhatsApp status.' })
  @UseGuards(AuthGuard('jwt'))
  async status(@Req() req) {
    this.assertAdmin(req);
    return this.wa.getStatus();
  }

  /** Envoi texte */
  @Post('send-text')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send WhatsApp text message' })
  @ApiBody({ type: SendTextDto })
  @ApiResponse({ status: 201, description: 'Message sent.' })
  @ApiResponse({ status: 400, description: 'Invalid payload or send failure.' })
  @UseGuards(AuthGuard('jwt'))
  async sendText(@Body() dto: SendTextDto, @Req() req) {
    this.assertAdmin(req);
    try {
      return await this.wa.sendText(dto.to, dto.message, dto.countryCode);
    } catch (e: any) {
      throw new HttpException(
        { success: false, error: e?.message ?? String(e) },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** Envoi média (via URL publique) */
  @Post('send-media')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send WhatsApp media message by URL' })
  @ApiBody({ type: SendMediaDto })
  @ApiResponse({ status: 201, description: 'Media message sent.' })
  @ApiResponse({ status: 400, description: 'Invalid payload or send failure.' })
  @UseGuards(AuthGuard('jwt'))
  async sendMedia(@Body() dto: SendMediaDto, @Req() req) {
    this.assertAdmin(req);
    try {
      return await this.wa.sendMediaUrl(
        dto.to,
        dto.fileUrl,
        dto.caption,
        dto.countryCode,
      );
    } catch (e: any) {
      throw new HttpException(
        { success: false, error: e?.message ?? String(e) },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** Envoi template Meta */
  @Post('send-template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send WhatsApp template message' })
  @ApiBody({ type: SendTemplateDto })
  @ApiResponse({ status: 201, description: 'Template message sent.' })
  @ApiResponse({ status: 400, description: 'Invalid payload or send failure.' })
  @UseGuards(AuthGuard('jwt'))
  async sendTemplate(@Body() dto: SendTemplateDto, @Req() req) {
    this.assertAdmin(req);
    try {
      return await this.wa.sendTemplate(
        dto.to,
        dto.templateName,
        dto.language,
        dto.bodyParams || [],
        dto.buttonUrlParam,
        dto.countryCode,
      );
    } catch (e: any) {
      throw new HttpException(
        { success: false, error: e?.message ?? String(e) },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertAdmin(req: any): void {
    if (!req.user?.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
  }
}
