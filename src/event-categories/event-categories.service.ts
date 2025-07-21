/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventCategories } from './event-categories.schema';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { CreateCategoryDto } from './create-category.dto';
import { Event } from '../event/event.schema';
import { Country } from '../country/country.schema';
import { City } from '../city/city.schema';
import { TicketClassesService } from '../ticket-classes/ticket-classes.service';
import { Ticket } from 'src/ticket/ticket.schema';

@Injectable()
export class EventCategoriesService {
  constructor(
    @InjectModel(EventCategories.name)
    private categoryModel: mongoose.Model<EventCategories>,
    @InjectModel(Event.name)
    private eventModel: mongoose.Model<Event>,
    @InjectModel(Country.name)
    private countryModel: mongoose.Model<Country>,
    @InjectModel(City.name)
    private cityModel: mongoose.Model<City>,
    private ticketClassesService: TicketClassesService,
  ) {}

  /**
   * Find all event categories with pagination and keyword search.
   * @param query - Query parameters including keyword and page number.
   * @returns A list of event categories.
   */
  async findAll(query: Query): Promise<EventCategories[]> {
    const resPerPage = 20;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    const keyword = query.keyword
      ? {
          name: {
            $regex: query.keyword,
            $options: 'i',
          },
        }
      : {};

    const countries = await this.categoryModel
      .find({ ...keyword })
      .limit(resPerPage)
      .skip(skip);
    return countries;
  }

  /**
   * Create a new event category.
   * @param category - The category data to create.
   * @returns The created event category.
   * @throws ConflictException if the category name already exists.
   */
  async creatCategory(category: CreateCategoryDto): Promise<EventCategories> {
    try {
      const res = await this.categoryModel.create(category);
      return res;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('This name of Categories already exists');
      }
      throw error; // Propagate other errors
    }
  }

  /**
   * Find an event category by ID.
   * @param categoryId - The ID of the category to find.
   * @returns The found event category.
   * @throws NotFoundException if the category ID is invalid or the category is not found.
   */
  async findById(categoryId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      throw new NotFoundException('Invalid categoryId');
    }

    const eventCategories = await this.categoryModel.findById(categoryId);
    if (!eventCategories) {
      throw new NotFoundException('EventCategories not found');
    }

    return eventCategories;
  }

  /**
   * Delete an event category by ID.
   * @param categoryId - The ID of the category to delete.
   * @returns The deleted event category.
   * @throws NotFoundException if the category ID is invalid.
   */
  async deleteCategory(categoryId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      throw new NotFoundException('Invalid categoryId');
    }
    return await this.categoryModel.findByIdAndDelete(categoryId);
  }

  /**
   * Update an event category by ID.
   * @param categoryId - The ID of the category to update.
   * @param categoryData - The updated category data.
   * @returns The updated event category.
   * @throws NotFoundException if the category ID is invalid.
   */
  async updateCategory(
    categoryId: string,
    categoryData: CreateCategoryDto,
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      throw new NotFoundException('Invalid categoryId');
    }

    const user = await this.categoryModel.findByIdAndUpdate(
      categoryId,
      categoryData,
      {
        new: true,
        runValidators: true,
      },
    );
    return user;
  }

  /**
   * Import predefined categories into the database.
   * This method is used to seed the database with initial category data.
   */
  async importCategories() {
    const categories = [
      {
        name: 'Professionnel',
        class: 'professional',
        cover: 'assets/imgs/pictures/cat_professional.png',
        icon: 'person-circle-outline',
        value: 'Professionnel',
        varTranslate: 'cat.pro',
      },
      {
        name: 'Social',
        class: 'social',
        cover: 'assets/imgs/pictures/cat_social.png',
        icon: 'heart-half-outline',
        value: 'Social',
        varTranslate: 'cat.social',
      },
      {
        name: 'Education',
        class: 'education',
        cover: 'assets/imgs/pictures/cat_education.png',
        icon: 'book-outline',
        value: 'Educatif',
        varTranslate: 'cat.edu',
      },
      {
        name: 'Santé',
        class: 'medical',
        cover: 'assets/imgs/pictures/cat_medical.png',
        icon: 'bandage-outline',
        value: 'Medical',
        varTranslate: 'cat.medical',
      },
      {
        name: 'Sport',
        class: 'sport',
        cover: 'assets/imgs/pictures/cat_sport.png',
        icon: 'football-outline',
        value: 'Sport',
        varTranslate: 'cat.sport',
      },
      {
        name: 'Fêtes/Diverts',
        class: 'party',
        cover: 'assets/imgs/pictures/cat_party.png',
        icon: 'sparkles-outline',
        value: 'Festif',
        varTranslate: 'cat.fest',
      },
      {
        name: 'Réligieux',
        class: 'religion',
        cover: 'assets/imgs/pictures/cat_religion.png',
        icon: 'pie-chart-outline',
        value: 'Religieux',
        varTranslate: 'cat.relig',
      },
      {
        name: 'Communautaire',
        class: 'communautaire',
        cover: 'assets/imgs/pictures/cat_communautaire.png',
        icon: 'people-circle-outline',
        value: 'Communautaire',
        varTranslate: 'cat.com',
      },
      {
        name: 'Caritatif',
        class: 'caritative',
        cover: 'assets/imgs/pictures/cat_caritative.png',
        icon: 'hand-left-outline',
        value: 'Caritatif',
        varTranslate: 'cat.carit',
      },
      {
        name: 'Culturel',
        class: 'cultural',
        cover: 'assets/imgs/pictures/cat_cultural.png',
        icon: 'help-buoy-outline',
        value: 'Culturel',
        varTranslate: 'cat.culture',
      },
    ];
    for (const category of categories) {
      try {
        await this.creatCategory(category);
      } catch (error) {
        console.log('Existing category: ', category.name);
      }
    }
  }

  /**
   * Get upcoming events of a specific category with optional city filter.
   * @param categoryId - The ID of the category to filter events.
   * @param query - Query parameters including keyword, page number, and city ID.
   * @returns A list of upcoming events for the specified category.
   * @throws Error if the category ID or city ID is invalid.
   * @throws NotFoundException if country, city, or ticket classes are not found.
   */
  async getUpcommingEventsOfCategory(categoryId: string, query: Query) {
    // Check if the category ID is valid
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      throw new Error('Invalid category ID');
    }
    const category = new mongoose.Types.ObjectId(categoryId);

    // Define pagination
    const resPerPage = 10;
    const currentPage = Number(query.page) || 1;
    if (isNaN(currentPage)) {
      throw new Error('Invalid page number');
    }
    const skip = resPerPage * (currentPage - 1);

    // Filter by keyword (optional)
    const keyword =
      typeof query.keyword === 'string' && query.keyword.trim() !== ''
        ? {
            title: {
              $regex: query.keyword.trim(),
              $options: 'i',
            },
          }
        : {};

    // Filter by date (upcoming events)
    const currentDate = new Date();

    // Build the aggregation pipeline
    const pipeline: any[] = [
      {
        $match: {
          ...keyword,
          categoryId: category,
          dateEnd: { $gte: currentDate },
        },
      },
      { $sample: { size: resPerPage } }, // Select 10 random events
      { $skip: skip }, // Apply pagination
    ];

    // Add city filter if cityId is provided
    if (query.cityId) {
      const city: any = query.cityId;
      if (!mongoose.Types.ObjectId.isValid(city)) {
        throw new Error('Invalid city ID');
      }
      const cityId = new mongoose.Types.ObjectId(city);
      pipeline[0].$match.cityId = cityId; // Add cityId to the $match filter
    }

    // Execute the aggregation
    const eventList = await this.eventModel.aggregate(pipeline);

    // If events are found, enrich the data
    if (eventList.length > 0) {
      const events = await Promise.all(
        eventList.map(async (eventItem) => {
          const countryData = await this.countryModel.findById(
            eventItem.countryId,
          );
          if (!countryData) {
            throw new NotFoundException('Country not found');
          }

          const cityData = await this.cityModel.findById(eventItem.cityId);
          if (!cityData) {
            throw new NotFoundException('City not found');
          }

          const ticketClasses = await this.ticketClassesService.findByEventId(
            eventItem._id,
          );
          if (!ticketClasses) {
            throw new NotFoundException('Ticket classes not found');
          }

          return {
            ...eventItem,
            countryData,
            cityData,
            ticketClasses,
          };
        }),
      );

      return events;
    } else {
      return eventList; // Return an empty list if no events are found
    }
  }
}
