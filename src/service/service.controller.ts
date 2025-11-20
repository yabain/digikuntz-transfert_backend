/* eslint-disable prettier/prettier */
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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ServiceService } from './service.service';
import { Service } from './service.schema';
import { CreateServiceDto } from './create-service.dto';
import { UpdateServiceDto } from './update-service.dto';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { multerConfigForService } from 'src/multer.config';

@Controller('service')
export class ServiceController {
  constructor(private serviceService: ServiceService) { }

  // Research

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all service (admin only)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of service returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getAllServices(
    @Query() query: ExpressQuery,
    @Req() req,
  ): Promise<Service[]> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.serviceService.getAllService(query);
  }

  // Get Statistics
  @Get('get-statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about all service (admin only)' })
  @ApiResponse({ status: 200, description: 'Service Statistics.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getServiceStatistics(@Req() req): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.serviceService.getServiceStatistics();
  }

  @Get('get-my-statistics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about service of User' })
  @ApiResponse({ status: 200, description: 'Service Statistics.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getMyServiceStatistics(@Req() req): Promise<any> {
    return this.serviceService.getMyServiceStatistics(req.user._id);
  }

  @Get('get-your-statistics/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about service of User' })
  @ApiResponse({ status: 200, description: 'Service Statistics.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getYourServiceStatistics(
    @Param('id') userId: string,
    @Req() req,
  ): Promise<any> {
    if (!req.user.isAdmin) {
      throw new NotFoundException('Unautorised');
    }
    return this.serviceService.getMyServiceStatistics(userId);
  }

  /////

  @Get('serviceList/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get statistics about service of User' })
  @ApiResponse({ status: 200, description: 'Service Statistics.' })
  async getServiceList(@Param('id') userId: string): Promise<any> {
    return this.serviceService.getServiceList(userId);
  }

  @Put('update-status/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user status' })
  @ApiBody({ type: UpdateServiceDto })
  @ApiResponse({ status: 200, description: 'User profile updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateStatus(@Param('id') planId: string, @Req() req): Promise<any> {
    return this.serviceService.updateStatus(planId, req.user);
  }

  @Get('get-data/:id')
  @ApiOperation({ summary: 'Get service data by ID' })
  @ApiParam({ name: 'id', description: 'service ID', type: String })
  @ApiResponse({ status: 200, description: 'service data returned.' })
  async getService(@Param('id') serviceId: string): Promise<any> {
    return this.serviceService.getServiceById(serviceId);
  }

  @Post('new')
  @ApiOperation({ summary: 'Create a new service' })
  @ApiBody({ type: CreateServiceDto })
  @ApiResponse({ status: 201, description: 'service created.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createService(@Body() service: any, @Req() req): Promise<any> {
    return this.serviceService.creatService(service, req.user);
  }

  @Put('picture/:id')
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
  @UseInterceptors(FilesInterceptor('pictureFile', 1, multerConfigForService))
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updatePicture(
    @Param('id') serviceId: string,
    @UploadedFiles() picture: Array<Express.Multer.File>,
  ): Promise<any> {
    if (!picture || picture.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    return this.serviceService.updateServicePicture(serviceId, picture);
  }


  ///////// ------ //////

  @Put('update-service/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the plan' })
  @ApiBody({ type: UpdateServiceDto })
  @ApiResponse({ status: 200, description: 'Service updated.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async update(
    @Param('id') serviceId: string,
    @Body() serviceData: UpdateServiceDto,
    @Req() req,
  ): Promise<any> {
    return this.serviceService.updateService(req.user, serviceId, serviceData);
  }

  @Delete('delete/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a service by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'Services ID', type: String })
  @ApiResponse({ status: 200, description: 'Services deleted.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async delete(@Param('id') serviceId: string, @Req() req): Promise<any> {
    return this.serviceService.deleteService(serviceId, req.user);
  }

  @Get('research')
  @ApiOperation({ summary: 'Search for service by name' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({
    status: 200,
    description: 'List of service matching the search criteria.',
  })
  async serviceResearch(@Query() query: ExpressQuery): Promise<any> {
    return this.serviceService.searchByTitle(query);
  }
}
