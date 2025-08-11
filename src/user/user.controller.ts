/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { multerConfigForUser } from '..//multer.config';
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
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of users returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllUser(@Query() query: ExpressQuery, @Req() req): Promise<User[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.userService.searchByEmail(query);
  }

  /**
   * Get user data by ID.
   */
  @Get('user-data/:id')
  @ApiOperation({ summary: 'Get user data by ID' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'User data returned.' })
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
  @UsePipes(ValidationPipe)
  async createUser(@Body() user: CreateUserDto): Promise<User> {
    return this.userService.creatUser(user);
  }

  /**
   * Update the profile of the authenticated user.
   */
  @Put('update-profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the profile of the authenticated user' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User profile updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async update(@Body() userData: UpdateUserDto, @Req() req): Promise<any> {
    return this.userService.updateUser(req.user._id, userData);
  }

  /**
   * Update the profile picture of the authenticated user.
   */
  @Put('picture')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update the profile picture of the authenticated user',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pictureFile: {
          type: 'string',
          format: 'binary',
          description: 'Profile picture file',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'User profile picture updated.' })
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
   * Delete a user by ID. Only accessible by admin users.
   */
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'User deleted.' })
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') userId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.userService.deleteUser(userId);
  }

  /**
   * Search for users by name with optional query parameters for filtering and pagination.
   */
  @Get('research')
  @ApiOperation({ summary: 'Search for users by name' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({
    status: 200,
    description: 'List of users matching the search criteria.',
  })
  async userResearch(@Query() query: ExpressQuery): Promise<any> {
    return this.userService.searchByName(query);
  }

  // Redirections (not documented in Swagger)
  @Get('*path')
  getRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }

  @Post('*path')
  postRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }

  @Put('*path')
  putRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }

  @Delete('*path')
  deleteRedirect(@Res() res: Response) {
    return res.redirect('https://yabi.cm');
  }
}
