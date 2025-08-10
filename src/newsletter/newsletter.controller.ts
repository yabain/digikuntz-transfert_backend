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

@Controller('newsletter')
export class NewsletterController {
  constructor(private newsletterService: NewsletterService) {}

  @Get()
  async findAllSubscribers(
    @Query() query: ExpressQuery,
  ): Promise<Newsletter[]> {
    return this.newsletterService.findAllSubscribers(query);
  }

  @Post('new')
  async createSubscriber(
    @Body() Subscriber: CreateSubscriberDto,
  ): Promise<boolean> {
    console.log('Creating new subscriber:', Subscriber);
    return this.newsletterService.creatSubscriber(Subscriber);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async deleteSubscriber(@Param('id') SubscriberId: string): Promise<any> {
    return this.newsletterService.deleteSubscriber(SubscriberId);
  }
}
