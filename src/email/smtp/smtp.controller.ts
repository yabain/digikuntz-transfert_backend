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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SmtpService } from './smtp.service';

@ApiTags('smtp')
@Controller('smtp')
export class SmtpController {
  constructor(private readonly smtpService: SmtpService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SMTP configuration (admin only)' })
  @ApiResponse({ status: 200, description: 'SMTP configuration returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  getSmtpData(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.smtpService.getSmtpData();
  }

  @Put('update')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SMTP configuration (admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        host: 'smtp.gmail.com',
        port: 587,
        user: 'no-reply@digikuntz.com',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'SMTP configuration updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  updateSmtpData(@Req() req, @Body() data: any): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.smtpService.updateSmtpData({ ...data });
  }

  @Get('reset')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset SMTP configuration to default (admin only)' })
  @ApiResponse({ status: 200, description: 'SMTP configuration reset.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  resetSmtp(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unauthorised');
    }
    return this.smtpService.resetSmtp();
  }
}
