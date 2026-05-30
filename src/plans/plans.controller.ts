/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { Plans } from './plans.schema';
import { CreatePlansDto } from './create-plans.dto';
import { UpdatePlansDto } from './update-plans.dto';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private plansService: PlansService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all plans (admin only)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search filter' })
  @ApiResponse({ status: 200, description: 'List of plans returned.', schema: { example: [] } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllPlanss(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Plans[]> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.plansService.getAllPlans(query);
  }

  @Get('get-statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about all plans (admin only)' })
  @ApiResponse({ status: 200, description: 'Plans statistics.', schema: { example: { total: 10, active: 7, inactive: 3 } } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getPlansStatistics(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.plansService.getPlansStatistics();
  }

  @Get('get-my-statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about plans of current user' })
  @ApiResponse({ status: 200, description: 'Plans statistics.', schema: { example: { total: 3, active: 2 } } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyPlansStatistics(@Req() req): Promise<any> {
    return this.plansService.getMyPlansStatistics(req.user._id);
  }

  @Get('get-your-statistics/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about plans of a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'Plans statistics.', schema: { example: { total: 3, active: 2 } } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getYourPlansStatistics(
    @Param('id') userId: string,
    @Req() req,
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.plansService.getMyPlansStatistics(userId);
  }

  @Get('planList/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get plans list of a user' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'Plans list returned.', schema: { example: [] } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getPlansList(@Param('id') userId: string, @Req() req): Promise<any> {
    return this.plansService.getPlansList(userId, req.user);
  }

  @Put('update-status/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle plan active status' })
  @ApiParam({ name: 'id', description: 'Plan ID', type: String })
  @ApiResponse({ status: 200, description: 'Plan status updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateStatus(@Param('id') planId: string, @Req() req): Promise<any> {
    return this.plansService.updateStatus(planId, req.user);
  }

  @Get('get-data/:id')
  @ApiOperation({ summary: 'Get plan data by ID' })
  @ApiParam({ name: 'id', description: 'Plan ID', type: String })
  @ApiResponse({ status: 200, description: 'Plan data returned.' })
  @ApiResponse({ status: 404, description: 'Plan not found.' })
  async getPlans(@Param('id') plansId: string): Promise<any> {
    return this.plansService.getPlansById(plansId);
  }

  @Post('new')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new plan' })
  @ApiBody({ type: CreatePlansDto })
  @ApiResponse({ status: 201, description: 'Plan created.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createPlans(@Body() plans: any, @Req() req): Promise<any> {
    return this.plansService.createPlans(plans, req.user);
  }

  @Post('add-subscriber')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a subscriber to a plan' })
  @ApiBody({ schema: { example: { planId: '664f...', userId: '664f...' } } })
  @ApiResponse({ status: 201, description: 'Subscriber added.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async addSubscriber(@Body() data: any): Promise<any> {
    return this.plansService.addSubscriber(data);
  }

  @Put('update-plans/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a plan' })
  @ApiParam({ name: 'id', description: 'Plan ID', type: String })
  @ApiBody({ type: UpdatePlansDto })
  @ApiResponse({ status: 200, description: 'Plan updated.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async update(
    @Param('id') plansId: string,
    @Body() plansData: UpdatePlansDto,
    @Req() req,
  ): Promise<any> {
    return this.plansService.updatePlans(req.user, plansId, plansData);
  }

  @Delete('delete/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a plan by ID' })
  @ApiParam({ name: 'id', description: 'Plan ID', type: String })
  @ApiResponse({ status: 200, description: 'Plan deleted.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async delete(@Param('id') plansId: string, @Req() req): Promise<any> {
    return this.plansService.deletePlans(plansId, req.user);
  }

  @Get('research')
  @ApiOperation({ summary: 'Search plans by name' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search filter' })
  @ApiResponse({ status: 200, description: 'Plans matching search criteria.', schema: { example: [] } })
  async plansResearch(@Query() query: ExpressQuery): Promise<any> {
    return this.plansService.searchByTitle(query);
  }
}
