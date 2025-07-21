/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { AuthGuard } from '@nestjs/passport';
import { Query as ExpressQuery } from 'express-serve-static-core';

@Controller('favorite')
export class FavoriteController {
  constructor(private favoriteService: FavoriteService) {}

  /**
   * Get all favorite events of the authenticated user with pagination.
   * @param eventId - The ID of the event (unused in this method).
   * @param req - The request object containing the authenticated user.
   * @param query - Query parameters for pagination.
   * @returns A list of favorite events with additional details.
   */
  @Get('get-favorites-event/:id')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication.
  @UsePipes(ValidationPipe) // Validate the incoming data.
  async gestAllFavoritesEventOfUser(
    @Param('id') eventId: string,
    @Req() req,
    @Query() query: ExpressQuery,
  ): Promise<any> {
    return this.favoriteService.gestAllFavoritesEventOfUser(
      req.user._id,
      query,
    );
  }

  /**
   * Check if a specific event is in the authenticated user's favorites.
   * @param evenId - The ID of the event to check.
   * @param req - The request object containing the authenticated user.
   * @returns A boolean indicating whether the event is in the user's favorites.
   */
  @Get(':id')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication.
  @UsePipes(ValidationPipe) // Validate the incoming data.
  async chekIfEventIsInFavorites(
    @Param('id') evenId: string,
    @Req() req,
  ): Promise<any> {
    return this.favoriteService.chekIfEventIsInFavorites(evenId, req.user._id);
  }

  /**
   * Add an event to the authenticated user's favorites.
   * @param favorite - The event data to add to favorites.
   * @param req - The request object containing the authenticated user.
   * @returns A boolean indicating success.
   */
  @Post('add')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication.
  @UsePipes(ValidationPipe) // Validate the incoming data.
  async addToFavorites(@Body() favorite: any, @Req() req): Promise<any> {
    const favoriteData = {
      ...favorite,
      userId: req.user._id, // Add the authenticated user's ID to the favorite data.
    };
    return this.favoriteService.addToFavorites(favoriteData);
  }

  /**
   * Remove an event from the authenticated user's favorites.
   * @param eventId - The ID of the event to remove from favorites.
   * @param req - The request object containing the authenticated user.
   * @returns A boolean indicating success.
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt')) // Protect the route with authentication.
  @UsePipes(ValidationPipe) // Validate the incoming data.
  async removeToFavorites(
    @Param('id') eventId: string,
    @Req() req,
  ): Promise<any> {
    const favoriteData = {
      eventId: eventId,
      userId: req.user._id, // Add the authenticated user's ID to the favorite data.
    };
    return this.favoriteService.removeToFavorites(favoriteData);
  }
}
