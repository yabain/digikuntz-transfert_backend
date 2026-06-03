/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,ForbiddenException,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.schema';
import { CreateUserDto } from './create-user.dto';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { UpdateUserDto } from './update-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { multerConfigForUser, multerConfigForCover } from '..//multer.config';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('user')
@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  /**
   * Get all users with optional query parameters for filtering and pagination.
   * Only accessible by admin users.
   */
  @Get('all-users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search filter' })
  @ApiResponse({ status: 200, description: 'List of users returned.', schema: { example: [] } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllUsers(@Query() query: ExpressQuery, @Req() req): Promise<User[]> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.userService.getAllUsers(query);
  }

  @Get('get-statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user statistics by month (admin only)' })
  @ApiResponse({ status: 200, description: 'User statistics by month.', schema: { example: [{ month: '2025-01', count: 12 }] } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getEmailStatsByMonth(@Req() req): Promise<any[]> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.userService.getUserStatsByMonth(req.user);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users by email (admin only)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search filter' })
  @ApiResponse({ status: 200, description: 'List of users returned.', schema: { example: [] } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async searchByEmail(@Query() query: ExpressQuery, @Req() req): Promise<User[]> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.userService.searchByEmail(query);
  }

  @Get('subscriber-candidates')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search existing users by email or WhatsApp for subscriber assignment' })
  @ApiQuery({ name: 'keyword', required: true, type: String, description: 'Email or WhatsApp/phone keyword' })
  @ApiResponse({ status: 200, description: 'Matching users returned.', schema: { example: [] } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async searchSubscriberCandidates(
    @Query() query: ExpressQuery,
  ): Promise<any[]> {
    return this.userService.searchSubscriberCandidates(query);
  }

  /**
   * Get all users with optional query parameters for filtering and pagination.
   * Only accessible by admin users.
   */
  @Get('users-stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about all users (admin only)' })
  @ApiResponse({ status: 200, description: 'Users statistics.', schema: { example: { total: 500, active: 420, verified: 380 } } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getUsersStatistic(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.userService.getUsersStatistic();
  }

  /**
   * Get user data by ID.
   */
  @Get('user-data/:id')
  @ApiOperation({ summary: 'Get user data by ID' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'User data returned.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getUser(@Param('id') userId: string): Promise<any> {
    return this.userService.getUserById(userId);
  }

  /**
   * Create a new user.
   */
  @Post('new')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User created.' })
  @ApiResponse({ status: 409, description: 'User already exists.' })
  @UsePipes(ValidationPipe)
  async createUser(@Body() user: CreateUserDto): Promise<User> {
    return this.userService.createUser(user);
  }

  /**
   * Update the profile of the authenticated user.
   */
  @Put('update-profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile of the authenticated user' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User profile updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async update(@Body() userData: UpdateUserDto, @Req() req): Promise<any> {
    return this.userService.updateUser(req.user._id, userData);
  }

  /**
   * Update the profile of the authenticated user.
   */
  @Put('update-items')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update specific items of the authenticated user profile' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User items updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateItems(@Body() userData: any, @Req() req): Promise<any> {
    return this.userService.updateItems(req.user._id, userData);
  }

  /**
   * Update the profile picture of the authenticated user.
   */
  @Put('picture')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update profile picture of the authenticated user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { pictureFile: { type: 'string', format: 'binary', description: 'Profile picture file' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Profile picture updated.' })
  @ApiResponse({ status: 400, description: 'No file uploaded.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseInterceptors(FilesInterceptor('pictureFile', 1, multerConfigForUser))
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updatePicture(
    @Req() req,
    @UploadedFiles() picture: Array<Express.Multer.File>,
  ): Promise<any> {
    if (!picture || picture.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    return this.userService.updateUserPicture(req, picture);
  }


  /**
   * Update the profile cover of the authenticated user.
   */
  @Put('cover')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update profile cover of the authenticated user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { pictureFile: { type: 'string', format: 'binary', description: 'Profile cover file' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Profile cover updated.' })
  @ApiResponse({ status: 400, description: 'No file uploaded.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseInterceptors(FilesInterceptor('coverFile', 1, multerConfigForCover))
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateCover(
    @Req() req,
    @UploadedFiles() picture: Array<Express.Multer.File>,
  ): Promise<any> {
    if (!picture || picture.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    return this.userService.updateUserCover(req, picture);
  }

  /**
   * Delete a user by ID. Only accessible by admin users.
   */
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'User deleted.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.userService.deleteUser(userId);
  }

  /**
   * Search for users by name with optional query parameters for filtering and pagination.
   */
  @Get('research')
  @ApiOperation({ summary: 'Search users by name' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search filter' })
  @ApiResponse({ status: 200, description: 'Users matching search criteria.', schema: { example: [] } })
  async userResearch(@Query() query: ExpressQuery): Promise<any> {
    return this.userService.searchByName(query);
  }

  @Put('update-status/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle user active status (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'User status updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateStatus(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.userService.updateStatus(userId);
  }

  @Put('update-adminStatus/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle user admin status (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'User admin status updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateAdminStatus(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.userService.updateAdminStatus(userId);
  }

  @Put('update-verifiedStatus/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle user verified status (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'User verified status updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateVerifiedStatus(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.userService.updateVerifiedStatus(userId);
  }

  // Redirections (not documented in Swagger)
  @Get('*path')
  getRedirect(@Res() res: Response) {
    return res.redirect('https://payments.digikuntz.com');
  }

  @Post('*path')
  postRedirect(@Res() res: Response) {
    return res.redirect('https://payments.digikuntz.com');
  }

  @Put('*path')
  putRedirect(@Res() res: Response) {
    return res.redirect('https://payments.digikuntz.com');
  }

  @Delete('*path')
  deleteRedirect(@Res() res: Response) {
    return res.redirect('https://payments.digikuntz.com');
  }
}
