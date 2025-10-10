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
import { WhatsappService } from './whatsapp.service';
import { SendTextDto } from './dto/send-text.dto';
import { SendMediaDto } from './dto/send-media.dto';

@Controller('wa')
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  /** QR courant (null si déjà authentifié) */
  @Get('qr')
  async qr() {
    return this.wa.getQr();
  }

  /** État courant (ready + state) */
  @Get('status')
  async status() {
    return this.wa.getStatus();
  }

  /** Envoi texte */
  @Post('send-text')
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
