import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { EventCategoriesService } from './event-categories.service';
import { CreateCategoryDto } from './create-category.dto';
import { EventCategories } from './event-categories.schema';

@Controller('category')
export class EventCategoriesController {
  constructor(private categoryService: EventCategoriesService) {}

  /**
   * Get all event categories with optional query parameters for filtering and pagination.
   * @param query - Query parameters for filtering and pagination.
   * @returns A list of event categories.
   */
  @Get()
  async getAllCategories(
    @Query() query: ExpressQuery,
  ): Promise<EventCategories[]> {
    return this.categoryService.findAll(query);
  }

  /**
   * Create a new event category.
   * @param category - The category data to create.
   * @returns The created event category.
   * @throws ConflictException if the category name already exists.
   */
  @Post('new')
  @UseGuards(AuthGuard('jwt')) // Apply authentication guard to protect the route.
  @UsePipes(ValidationPipe) // Validate the incoming data using the CreateCategoryDto.
  async createCategory(
    @Body() category: CreateCategoryDto,
  ): Promise<EventCategories> {
    return this.categoryService.creatCategory(category);
  }

  /**
   * Delete an event category by ID.
   * @param categoryId - The ID of the category to delete.
   * @returns The deleted event category.
   * @throws NotFoundException if the category ID is invalid.
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt')) // Apply authentication guard to protect the route.
  @UsePipes(ValidationPipe) // Validate the incoming data using the CreateCategoryDto.
  async deleteCategory(@Param('id') categoryId: string): Promise<any> {
    return this.categoryService.deleteCategory(categoryId);
  }

  /**
   * Update an event category by ID.
   * @param categoryId - The ID of the category to update.
   * @param categoryData - The updated category data.
   * @returns The updated event category.
   * @throws NotFoundException if the category ID is invalid.
   */
  @Put(':id')
  @UseGuards(AuthGuard('jwt')) // Apply authentication guard to protect the route.
  @UsePipes(ValidationPipe) // Validate the incoming data using the CreateCategoryDto.
  async updateCategory(
    @Param('id') categoryId: string,
    @Body() categoryData: CreateCategoryDto,
  ): Promise<any> {
    return this.categoryService.updateCategory(categoryId, categoryData);
  }

  /**
   * Get an event category by ID.
   * @param categoryId - The ID of the category to retrieve.
   * @returns The found event category.
   * @throws NotFoundException if the category ID is invalid or the category is not found.
   */
  @Get(':id')
  async getCategory(@Param('id') categoryId: string): Promise<any> {
    return this.categoryService.findById(categoryId);
  }

  /**
   * Import predefined categories into the database.
   * This method is used to seed the database with initial category data.
   * @returns A confirmation message or the result of the import operation.
   */
  @Post('import')
  async importCategory(): Promise<any> {
    return this.categoryService.importCategories();
  }

  /**
   * Get upcoming events of a specific category with optional city filter.
   * @param categoryId - The ID of the category to filter events.
   * @param query - Query parameters including keyword, page number, and city ID.
   * @returns A list of upcoming events for the specified category.
   * @throws Error if the category ID or city ID is invalid.
   * @throws NotFoundException if country, city, or ticket classes are not found.
   */
  @Get('eventslist/:id')
  async getUpcommingEventsOfCategory(
    @Param('id') categoryId: string,
    @Query() query: ExpressQuery,
  ): Promise<any> {
    return this.categoryService.getUpcommingEventsOfCategory(categoryId, query);
  }
}
