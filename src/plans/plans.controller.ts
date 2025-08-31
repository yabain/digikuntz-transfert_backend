/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
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
} from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { Plans } from './plans.schema';
import { CreatePlansDto } from './create-plans.dto';
import { UpdatePlansDto } from './update-plans.dto';

@Controller('plans')
export class PlansController {
  constructor(private plansService: PlansService) {}

  // Research

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all plans (admin only)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of plans returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllPlanss(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Plans[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.plansService.getAllPlans(query);
  }

  // Get Statistics

  @Get('get-statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about all plans (admin only)' })
  @ApiResponse({ status: 200, description: 'Plans Statistics.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getPlansStatistics(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.plansService.getPlansStatistics();
  }

  @Get('get-my-statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about plans of User' })
  @ApiResponse({ status: 200, description: 'Plans Statistics.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyPlansStatistics(@Req() req): Promise<any> {
    return this.plansService.getMyPlansStatistics(req.user._id);
  }

  @Get('get-your-statistics/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about plans of User' })
  @ApiResponse({ status: 200, description: 'Plans Statistics.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getYourPlansStatistics(
    @Param('id') userId: string,
    @Req() req,
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.plansService.getMyPlansStatistics(userId);
  }

  /////

  @Get('planList/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about plans of User' })
  @ApiResponse({ status: 200, description: 'Plans Statistics.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getPlansList(@Param('id') userId: string, @Req() req): Promise<any> {
    return this.plansService.getPlansList(userId, req.user);
  }

  @Put('update-status/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user status' })
  @ApiBody({ type: UpdatePlansDto })
  @ApiResponse({ status: 200, description: 'User profile updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateStatus(@Param('id') planId: string, @Req() req): Promise<any> {
    return this.plansService.updateStatus(planId, req.user);
  }


  ///////// ------ //////
  @Get('get-data/:id')
  @ApiOperation({ summary: 'Get plans data by ID' })
  @ApiParam({ name: 'id', description: 'plans ID', type: String })
  @ApiResponse({ status: 200, description: 'plans data returned.' })
  async getPlans(@Param('id') plansId: string): Promise<any> {
    return this.plansService.getPlansById(plansId);
  }

  @Post('new')
  @ApiOperation({ summary: 'Create a new plan' })
  @ApiBody({ type: CreatePlansDto })
  @ApiResponse({ status: 201, description: 'plan created.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createPlanss(@Body() plans: any, @Req() req): Promise<any> {
    return this.plansService.creatPlans(plans, req.user);
  }

  @Put('update-plans/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the plan' })
  @ApiBody({ type: UpdatePlansDto })
  @ApiResponse({ status: 200, description: 'Plans updated.' })
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
  @ApiOperation({ summary: 'Delete a plans by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'Planss ID', type: String })
  @ApiResponse({ status: 200, description: 'Planss deleted.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async delete(@Param('id') plansId: string, @Req() req): Promise<any> {
    return this.plansService.deletePlans(plansId, req.user);
  }

  @Get('research')
  @ApiOperation({ summary: 'Search for plans by name' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({
    status: 200,
    description: 'List of plans matching the search criteria.',
  })
  async plansResearch(@Query() query: ExpressQuery): Promise<any> {
    return this.plansService.searchByTitle(query);
  }
}
