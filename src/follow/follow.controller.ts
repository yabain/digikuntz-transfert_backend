/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FollowService } from './follow.service';
import { AuthGuard } from '@nestjs/passport';
import { Query as ExpressQuery } from 'express-serve-static-core';

@Controller('follow')
export class FollowController {
  constructor(private followService: FollowService) {}

  @Get('follow-ckeck/:id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async chekIfIFollows(@Param('id') userId: string, @Req() req): Promise<any> {
    return this.followService.chekIfIFollows(req.user._id, userId);
  }

  @Get('new/:id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async follow(@Param('id') userId: string, @Req() req): Promise<any> {
    return this.followService.follow(req.user._id, userId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async unFollow(@Param('id') userId: string, @Req() req): Promise<any> {
    return this.followService.unFollow(req.user._id, userId);
  }

  @Get('followers-number')
  @UsePipes(ValidationPipe)
  async getFollowersNumber(@Req() req): Promise<any> {
    return this.followService.getFollowersNumber(req.user._id);
  }

  @Get('followings-number')
  @UsePipes(ValidationPipe)
  async getFollowingsNumber(@Req() req): Promise<any> {
    return this.followService.getFollowingsNumber(req.user._id);
  }

  @Get('followers-list/:id')
  @UsePipes(ValidationPipe)
  async getFollowersList(
    @Param('id') userId: string,
    @Query() query: ExpressQuery,
  ): Promise<any> {
    return this.followService.getFollowersList(userId, query);
  }

  @Get('followings-list/:id')
  @UsePipes(ValidationPipe)
  async getFollowingsList(
    @Param('id') userId: string,
    @Query() query: ExpressQuery,
  ): Promise<any> {
    return this.followService.getFollowingsList(userId, query);
  }
}
