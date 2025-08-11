/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { Newsletter } from './newsletter.schema';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';
import { CreateSubscriberDto } from './create-subscriber.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private newsletterService: NewsletterService) {}

  @Get()
  @ApiOperation({ summary: 'Get all newsletter subscribers' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search filter',
  })
  @ApiResponse({ status: 200, description: 'List of subscribers returned.' })
  async findAllSubscribers(
    @Query() query: ExpressQuery,
  ): Promise<Newsletter[]> {
    return this.newsletterService.findAllSubscribers(query);
  }

  @Post('new')
  @ApiOperation({ summary: 'Create a new newsletter subscriber' })
  @ApiBody({ type: CreateSubscriberDto })
  @ApiResponse({ status: 201, description: 'Subscriber created.' })
  async createSubscriber(
    @Body() Subscriber: CreateSubscriberDto,
  ): Promise<boolean> {
    console.log('Creating new subscriber:', Subscriber);
    return this.newsletterService.creatSubscriber(Subscriber);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a subscriber by ID' })
  @ApiParam({ name: 'id', description: 'Subscriber ID', type: String })
  @ApiResponse({ status: 200, description: 'Subscriber deleted.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async deleteSubscriber(@Param('id') SubscriberId: string): Promise<any> {
    return this.newsletterService.deleteSubscriber(SubscriberId);
  }
}
