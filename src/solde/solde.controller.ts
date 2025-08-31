/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { SoldeService } from './solde.service';

@Controller('solde')
export class SoldeController {
  constructor(private readonly soldeService: SoldeService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get solde of current users' })
  @ApiResponse({ status: 200, description: 'Solde of users returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getSolde(@Req() req): Promise<any> {
    console.log('solde')
    return this.soldeService.getSoldeByUserId(req.user._id);
  }

  @Get('user/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get solde of users (admin only)' })
  @ApiResponse({ status: 200, description: 'Solde of users returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getSoldeOfUser(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.soldeService.getSoldeByUserId(userId);
  }
}
