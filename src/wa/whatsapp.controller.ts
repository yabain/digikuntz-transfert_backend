/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { SendTextDto } from './dto/send-text.dto';
import { SendMediaDto } from './dto/send-media.dto';

@ApiTags('whatsapp')
@Controller('wa')
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  /** QR courant (null si déjà authentifié) */
  @Get('qr')
  @ApiOperation({ summary: 'Get current WhatsApp QR code' })
  @ApiResponse({ status: 200, description: 'Current QR/state response.' })
  async qr() {
    return this.wa.getQr();
  }

  /** État courant (ready + state) */
  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, description: 'Current WhatsApp status.' })
  async status() {
    return this.wa.getStatus();
  }

  /** Envoi texte */
  @Post('send-text')
  @ApiOperation({ summary: 'Send WhatsApp text message' })
  @ApiBody({ type: SendTextDto })
  @ApiResponse({ status: 201, description: 'Message sent.' })
  @ApiResponse({ status: 400, description: 'Invalid payload or send failure.' })
  async sendText(@Body() dto: SendTextDto) {
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
  @ApiOperation({ summary: 'Send WhatsApp media message by URL' })
  @ApiBody({ type: SendMediaDto })
  @ApiResponse({ status: 201, description: 'Media message sent.' })
  @ApiResponse({ status: 400, description: 'Invalid payload or send failure.' })
  async sendMedia(@Body() dto: SendMediaDto) {
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
}
