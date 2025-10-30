/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserSettingsService } from './userSettings.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('userSettings')
@Controller('userSettings')
export class UserSettingsController {
  constructor(private userSettingsService: UserSettingsService) {}
  
  @Get('get')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getUsersStatistic( @Req() req): Promise<any> {
    return this.userSettingsService.getUserSettingd(req.user._id);
  }
  
  @Put('update/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async update(@Param('id') userId: string, @Body() userSettings: any, @Req() req): Promise<any> {
    // if (!req.user.isAdmin && userId != req.user._id) {
    //   throw new NotFoundException('Unautorised');
    // }
    console.log('data: ', userSettings)
    return this.userSettingsService.updateUserSettings(req.user._id, userSettings);
  }
}
