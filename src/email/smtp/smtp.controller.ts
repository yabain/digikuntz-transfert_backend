/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
import { AuthGuard } from '@nestjs/passport';
import { SmtpService } from './smtp.service';

@Controller('smtp')
export class SmtpController {
  constructor(private readonly smtpService: SmtpService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  getSmtpData(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.smtpService.getSmtpData();
  }

  @Put('update')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  updateSmtpData(@Req() req, @Body() data: any): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.smtpService.updateSmtpData({ ...data });
  }

  @Get('reset')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  resetSmtp(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.smtpService.resetSmtp();
  }
}
