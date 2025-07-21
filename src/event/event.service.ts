/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Event } from './event.schema';
import { Country } from '../country/country.schema';
import { City } from '../city/city.schema';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { CreateEventDto } from './create-event.dto';
import { UpdateEventDto } from './update-event.dto';
import { TicketClassesService } from '../ticket-classes/ticket-classes.service';
import { EventCategories } from '../event-categories/event-categories.schema';
import { TicketService } from '../ticket/ticket.service';
import { UserService } from '../user/user.service';
import { NotificationService } from 'src/notification/notification.service';
import { ConfigService } from '@nestjs/config';
import { generateFileUrl } from '../multer.config';

@Injectable()
export class EventService {
  constructor(
    @InjectModel(Event.name)
    private eventModel: mongoose.Model<Event>,
    @InjectModel(Country.name)
    private countryModel: mongoose.Model<Country>,
    @InjectModel(City.name)
    private cityModel: mongoose.Model<City>,
    @InjectModel(EventCategories.name)
    private eventCategoryModel: mongoose.Model<EventCategories>,
    private userService: UserService,
    private ticketClassesService: TicketClassesService,
    private TicketService: TicketService,
    private notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Find all public events with optional keyword search and pagination.
   * @param query - Query parameters for keyword search and pagination.
   * @returns A list of public events.
   */
  async findAll(query: Query): Promise<Event[]> {
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          title: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};
    const events = await this.eventModel
      .find({ ...keyword, type: 'public' })
      .limit(resPerPage)
      .skip(skip);
    return events;
  }

  /**
   * Create a new event.
   * @param event - The event data to create.
   * @param req - The request object containing the authenticated user.
   * @param files - The uploaded files (e.g., event cover image).
   * @returns The created event.
   */
  async creatEvent(
    event: CreateEventDto,
    req: any,
    files: Array<Express.Multer.File>,
  ): Promise<Event> {
    const userId = req.user._id;

    // Generate URLs for the uploaded files
    const fileUrls = files.map((file) => generateFileUrl(file.filename));

    // Prepare event data with the user ID and cover image URL
    const eventData = {
      ...event,
      autor: userId,
      cover: fileUrls[0],
    };

    // Create the event in the database
    const res = await this.eventModel.create(eventData);

    // Create ticket classes for the event
    await this.ticketClassesService.creatTicketClass(
      event.ticketClasses,
      res._id,
    );

    this.notificationService.createNotificationToFollowers(userId, res);

    return res;
  }

  /**
   * Find an event by ID and enrich it with additional data.
   * @param eventId - The ID of the event to find.
   * @returns The event details with additional data (e.g., author, country, city, ticket classes).
   * @throws NotFoundException if the event, ticket classes, or author is not found.
   */
  async findById(eventId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Invalid event ID');
    }

    // Find the event and populate related data (city, country, category)
    const event: any = await this.eventModel
      .findById(eventId)
      .populate('cityId')
      .populate('countryId')
      .populate('categoryId');
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Find ticket classes for the event
    const ticketClasses =
      await this.ticketClassesService.findByEventId(eventId);
    if (!ticketClasses) {
      throw new NotFoundException('Ticket classes not found');
    }

    // Get author data (excluding password)
    const userData: any = await this.userService.findById(event.autor);
    if (!userData) {
      throw new NotFoundException('Author not found');
    }

    // Enrich event data with additional details
    const eventData: any = { ...event._doc };
    const user: any = userData;
    user.password = ''; // Remove password for security
    user.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
    eventData.autorData = user;
    eventData.ticketClasses = ticketClasses;

    return eventData;
  }

  /**
   * Update an event by ID.
   * @param eventId - The ID of the event to update.
   * @param eventData - The updated event data.
   * @returns The updated event.
   * @throws NotFoundException if the event ID is invalid.
   */
  async updateEvent(eventId: string, eventData: UpdateEventDto): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Invalid event ID');
    }

    const event = await this.eventModel.findByIdAndUpdate(eventId, eventData, {
      new: true,
      runValidators: true,
    });

    return event;
  }

  /**
   * Delete an event by ID.
   * @param eventId - The ID of the event to delete.
   * @returns The result of the deletion operation.
   * @throws NotFoundException if the event ID is invalid.
   */
  async deleteEvent(eventId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Invalid event ID');
    }
    return await this.eventModel.findByIdAndDelete(eventId);
  }

  /**
   * Get the list of participants for a specific event.
   * @param eventId - The ID of the event.
   * @returns A list of participants.
   * @throws NotFoundException if the event ID is invalid or the event is not found.
   */
  async getParticipantsList(eventId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Invalid event ID');
    }

    // Get all tickets for the event
    const ticketsList: any =
      await this.TicketService.getAllTicketsOfEvent(eventId);
    if (!ticketsList) {
      throw new NotFoundException('Event not found');
    }

    // Remove duplicate participants based on user ID
    const uniqueData = Object.values(
      ticketsList.reduce((acc, obj) => {
        if (!acc[obj.userId]) {
          acc[obj.userId] = obj;
        }
        return acc;
      }, {}),
    );

    // Get user details for each participant
    let participants: any[] = [];
    for (const ticket of uniqueData as any[]) {
      const userId = new mongoose.Types.ObjectId(ticket.userId);
      const user = await this.userService.findById(userId);
      participants = [...participants, user];
    }

    return participants;
  }

  /**
   * Find an event by ID without additional data (e.g., for metadata purposes).
   * @param eventId - The ID of the event to find.
   * @returns The event details.
   * @throws NotFoundException if the event ID is invalid.
   */
  async findEventById(eventId: string): Promise<Event | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Invalid event ID');
    }
    return this.eventModel.findById(eventId).exec();
  }

  /**
   * Get public events of a specific user with pagination.
   * @param userId - The ID of the user.
   * @param query - Query parameters for pagination.
   * @returns A list of public events.
   * @throws NotFoundException if the user ID is invalid.
   */
  async getProgressivePublicEventsOfUser(
    userId: any,
    query: Query,
  ): Promise<Event[]> {
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const events = await this.eventModel
      .find({ autor: userId, type: 'public' })
      .limit(resPerPage)
      .skip(skip);
    return events;
  }

  /**
   * Get all events of a specific user with pagination and additional data.
   * @param userId - The ID of the user.
   * @param query - Query parameters for pagination.
   * @returns A list of events with additional data (e.g., city, country, ticket classes).
   * @throws NotFoundException if the user ID is invalid or no events are found.
   */
  async getProgressiveAllEventsOfUser(
    userId: any,
    query: Query,
  ): Promise<Event[]> {
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    // Find events and populate related data (city, country)
    const eventList = await this.eventModel
      .find({ autor: userId })
      .populate('cityId')
      .populate('countryId')
      .limit(resPerPage)
      .skip(skip);
    if (!eventList) {
      throw new NotFoundException('Event not found');
    }

    if (eventList.length > 0) {
      let events: any = [];
      for (const eventItem of eventList) {
        // Find ticket classes for the event
        const ticketClasses = await this.ticketClassesService.findByEventId(
          eventItem._id,
        );
        if (!ticketClasses) {
          throw new NotFoundException('Ticket classes not found');
        }

        // Enrich event data with additional details
        let eventData: any = { ...eventItem };
        eventData = eventData._doc;
        eventData.countryData = eventData.countryId;
        eventData.cityData = eventData.cityId;
        eventData.ticketClasses = ticketClasses;

        events = [...events, eventData];
      }

      return events;
    } else {
      return eventList;
    }
  }

  /**
   * Update the cover image of event.
   * @param req - The request object containing the authenticated user.
   * @param files - The uploaded files (e.g. cover picture).
   * @returns The updated event data.
   * @throws NotFoundException if the event ID is invalid or the event is not found.
   */
  async updateEventCover(
    req: any,
    eventId: any,
    files: Array<Express.Multer.File>,
  ): Promise<any> {
    // Check if the event ID is valid
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Invalid event');
    }

    // Find the event by ID
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Generate URLs for the uploaded files
    const fileUrls = files.map((file) => generateFileUrl(file.filename));

    // Prepare the update data with the new profile cover URL
    const eventPictureUpdate = { cover: fileUrls[0] };

    // Update the event's cover picture in the database
    const updatedEvent = await this.eventModel.findByIdAndUpdate(
      eventId,
      eventPictureUpdate,
      { new: true, runValidators: true },
    );

    return updatedEvent;
  }
}
