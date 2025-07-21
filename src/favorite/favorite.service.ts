/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Favorite } from './favorite.schema';
import { Event } from '../event/event.schema';
import { Query } from 'express-serve-static-core';
import { TicketClassesService } from 'src/ticket-classes/ticket-classes.service';

@Injectable()
export class FavoriteService {
  constructor(
    @InjectModel(Favorite.name)
    private favoriteModel: mongoose.Model<Favorite>,
    @InjectModel(Event.name)
    private eventModel: mongoose.Model<Event>,
    private ticketClassesService: TicketClassesService,
  ) {}

  /**
   * Get all favorite events of a user with pagination.
   * @param id - The ID of the user.
   * @param query - Query parameters for pagination.
   * @returns A list of favorite events with additional details.
   * @throws NotFoundException if ticket classes are not found.
   */
  async gestAllFavoritesEventOfUser(id: any, query: Query): Promise<Event[]> {
    const resPerPage = 25;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    let userId: any = id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      userId = new mongoose.Types.ObjectId(id);
    }

    // Find favorite events for the user with pagination
    const favorites = await this.favoriteModel
      .find({ userId: userId })
      .limit(resPerPage)
      .skip(skip);

    let events: any[] = [];
    for (const favorite of favorites) {
      // Find event details and populate country and city data
      const event = await this.eventModel
        .findById(favorite.eventId)
        .populate('countryId')
        .populate('cityId');

      // Find ticket classes for the event
      const ticketClasses = await this.ticketClassesService.findByEventId(
        favorite.eventId,
      );
      if (!ticketClasses) {
        throw new NotFoundException('Ticket classes not found');
      }

      // Enrich event data with additional details
      let eventData: any = { ...event };
      eventData = { ...eventData._doc };
      eventData.cityData = eventData.cityId;
      eventData.countryData = eventData.countryId;
      eventData.ticketClasses = ticketClasses;
      events = [...events, eventData];
    }

    console.log('Events', events);
    return events;
  }

  /**
   * Check if an event is in the favorites list of a user.
   * @param eId - The ID of the event to check.
   * @param id - The ID of the user.
   * @returns A boolean indicating whether the event is in the user's favorites.
   */
  async chekIfEventIsInFavorites(eId: any, id: any): Promise<boolean> {
    let userId: any = id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      userId = new mongoose.Types.ObjectId(id);
    }

    let eventId: any = eId;
    if (!mongoose.Types.ObjectId.isValid(eId)) {
      eventId = new mongoose.Types.ObjectId(eId);
    }

    // Find if the event is in the user's favorites
    const favorites = await this.favoriteModel
      .find({ eventId: eventId, userId: userId })
      .exec();
    return favorites.length > 0;
  }

  /**
   * Add an event to the user's favorites.
   * @param data - An object containing userId and eventId.
   * @returns A boolean indicating success.
   * @throws Error if userId or eventId is not a valid ObjectId.
   */
  async addToFavorites(data: any): Promise<any> {
    let userId: mongoose.Types.ObjectId;
    if (mongoose.Types.ObjectId.isValid(data.userId)) {
      userId = new mongoose.Types.ObjectId(data.userId);
    } else {
      throw new Error('userId is not a valid ObjectId');
    }

    let eventId: mongoose.Types.ObjectId;
    if (mongoose.Types.ObjectId.isValid(data.eventId)) {
      eventId = new mongoose.Types.ObjectId(data.eventId);
    } else {
      throw new Error('eventId is not a valid ObjectId');
    }

    // Create a new favorite entry
    const follow = {
      userId: userId,
      eventId: eventId,
    };
    // console.log('Adding to favorite', follow);

    const addData = await this.favoriteModel.create(follow);

    if (!addData) {
      throw new Error('Favorite not found');
    }

    return true;
  }

  /**
   * Remove an event from the user's favorites.
   * @param data - An object containing userId and eventId.
   * @returns A boolean indicating success.
   * @throws Error if userId or eventId is not a valid ObjectId.
   */
  async removeToFavorites(data: { userId: any; eventId: any }): Promise<any> {
    let userId: mongoose.Types.ObjectId;
    if (mongoose.Types.ObjectId.isValid(data.userId)) {
      userId = new mongoose.Types.ObjectId(data.userId);
    } else {
      throw new Error('userId is not a valid ObjectId');
    }

    let eventId: mongoose.Types.ObjectId;
    if (mongoose.Types.ObjectId.isValid(data.eventId)) {
      eventId = new mongoose.Types.ObjectId(data.eventId);
    } else {
      throw new Error('eventId is not a valid ObjectId');
    }

    // Define the filter to find the favorite entry
    const filter = {
      userId: userId,
      eventId: eventId,
    };

    // Check if the favorite entry exists
    const favorites = await this.favoriteModel
      .find({ eventId: eventId, userId: userId })
      .exec();
    if (favorites.length > 0) {
      // Delete the favorite entry
      const result = await this.favoriteModel.findOneAndDelete(filter).exec();
      if (!result) {
        throw new Error('Favorite not found');
      }
      return true;
    } else {
      return false;
    }
  }
}
