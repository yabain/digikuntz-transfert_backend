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
  ApiBody,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('userSettings')
@Controller('userSettings')
export class UserSettingsController {
  constructor(private userSettingsService: UserSettingsService) {}
  
  @Get('get')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user settings' })
  @ApiResponse({ status: 200, description: 'User settings returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMySettings(@Req() req): Promise<any> {
    return this.userSettingsService.getUserSettings(req.user._id);
  }

  @Get('get-user/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get settings by user ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User settings returned.' })
  @ApiResponse({ status: 404, description: 'User settings not found.' })
  async getUserSettings(@Param('id') userId: string): Promise<any> {
    return this.userSettingsService.getUserSettings(userId);
  }
  
  @Put('update/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user settings by ID (authenticated user)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
      example: { portal: true, language: 'fr' },
    },
  })
  @ApiResponse({ status: 200, description: 'User settings updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 404, description: 'User settings not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async update(@Param('id') userId: string, @Body() userSettings: any, @Req() req): Promise<any> {
    // if (!req.user.isAdmin && userId != req.user._id) {
    //   throw new NotFoundException('Unauthorised');
    // }
    console.log('data: ', userSettings)
    return this.userSettingsService.updateUserSettings(req.user._id, userSettings);
  }

  /**
   * Update the profile of the authenticated user.
   */
  @Put('update-items')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user settings fields' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
      example: { portal: true, portalSupportInfo: true },
    },
  })
  @ApiResponse({ status: 200, description: 'Settings fields updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateItems(@Body() userData: any, @Req() req): Promise<any> {
    return this.userSettingsService.updateItems(req.user._id, userData);
  }
}
