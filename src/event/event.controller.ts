/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { EventService } from './event.service';
import { Event } from './event.schema';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { UpdateEventDto } from './update-event.dto';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { multerConfig, multerConfigForEvent } from '..//multer.config';
import { Response } from 'express';

@Controller('event')
export class EventController {
  constructor(private eventService: EventService) {}

  /**
   * Get all events with optional query parameters for filtering and pagination.
   * @param query - Query parameters for filtering and pagination.
   * @returns A list of events.
   */
  @Get()
  async getAllEvents(@Query() query: ExpressQuery): Promise<Event[]> {
    return this.eventService.findAll(query);
  }

  /**
   * Get a specific event by ID.
   * @param eventId - The ID of the event to retrieve.
   * @returns The event details.
   */
  @Get(':id')
  async getEvent(@Param('id') eventId: string): Promise<any> {
    return this.eventService.findById(eventId);
  }

  /**
   * Create a new event.
   * @param event - The event data to create.
   * @param req - The request object containing the authenticated user.
   * @param files - The uploaded files (e.g., event cover image).
   * @returns The created event.
   */
  @Post('new')
  @UseInterceptors(FilesInterceptor('file', 1, multerConfig)) // Handle file uploads
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe) // Validate the incoming data
  async createEvent(
    @Body() event: any,
    @Req() req,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<any> {
    const eventData = {
      ...req.body,
      dateStart: new Date(req.body.dateStart),
      dateEnd: new Date(req.body.dateEnd),
    };
    return this.eventService.creatEvent(eventData, req, files);
  }

  /**
   * Update an existing event by ID.
   * @param eventId - The ID of the event to update.
   * @param event - The updated event data.
   * @param req - The request object containing the authenticated user.
   * @returns The updated event.
   * @throws Error if the user is not authorized to update the event.
   */
  @Put(':id')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  @UsePipes(ValidationPipe) // Validate the incoming data
  async update(
    @Param('id') eventId: string,
    @Body() event: UpdateEventDto,
    @Req() req,
  ): Promise<any> {
    if (req.user._id != event.autor) throw new Error('Unauthorized');
    return this.eventService.updateEvent(eventId, event);
  }

  /**
   * Update the cover image of event.
   * @param req - The request object containing the authenticated user.
   * @param picture - The uploaded picture file.
   * @returns The updated user data.
   * @throws BadRequestException if no file is uploaded.
   */
  @Put('picture/:id')
  @UseInterceptors(FilesInterceptor('eventCover', 1, multerConfigForEvent)) // Handle file uploads
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async updateEventCover(
    @Param('id') eventId: string,
    @Req() req,
    @UploadedFiles() picture: Array<Express.Multer.File>,
  ): Promise<any> {
    if (!picture || picture.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    return this.eventService.updateEventCover(req, eventId, picture);
  }

  /**
   * Delete an event by ID.
   * @param eventId - The ID of the event to delete.
   * @returns The result of the deletion operation.
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  async delete(@Param('id') eventId: string): Promise<any> {
    return this.eventService.deleteEvent(eventId);
  }

  /**
   * Get the list of participants for a specific event.
   * @param eventId - The ID of the event.
   * @returns A list of participants.
   */
  @Get('participants/:id')
  async getParticipantsList(@Param('id') eventId: string): Promise<any> {
    return this.eventService.getParticipantsList(eventId);
  }

  /**
   * Get progressive public events of a user with pagination.
   * @param eventId - The ID of the user.
   * @param query - Query parameters for pagination.
   * @returns A list of public events.
   */
  @Get('public-events/:id')
  async getProgressivePublicEventsOfUser(
    @Param('id') eventId: string,
    @Query() query: ExpressQuery,
  ): Promise<any> {
    return this.eventService.getProgressivePublicEventsOfUser(eventId, query);
  }

  /**
   * Get all events of the authenticated user with pagination.
   * @param eventId - The ID of the user (unused in this method).
   * @param req - The request object containing the authenticated user.
   * @param query - Query parameters for pagination.
   * @returns A list of all events of the user.
   */
  @Get('all-my-events/:id')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication
  async getProgressiveAllEventsOfUser(
    @Param('id') eventId: string,
    @Req() req,
    @Query() query: ExpressQuery,
  ): Promise<any> {
    return this.eventService.getProgressiveAllEventsOfUser(req.user._id, query);
  }

  /**
   * Get metadata for a specific event (e.g., title, image, description).
   * @param eventId - The ID of the event.
   * @returns The event metadata.
   */
  @Get('metadata/:id')
  async getEventMetadata(@Param('id') eventId: string) {
    const event = await this.eventService.findEventById(eventId);

    if (!event) {
      return { error: 'Event not found' };
    }

    return {
      title: event.title,
      image: event.cover, // Ensure `cover` contains the image URL
      description: event.description,
    };
  }

  //////////////////////////////////////////////
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
