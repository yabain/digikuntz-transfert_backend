/* eslint-disable @typescript-eslint/require-await */
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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AheadService } from './ahead.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateAheadDto } from './create-ahead.dto';

@Controller('ahead')
export class AheadController {
  constructor(private aheadService: AheadService) {}

  @Post('new')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async addToFavorites(
    @Body() ahead: CreateAheadDto,
    @Req() req,
  ): Promise<any> {
    const aheadData = {
      ...ahead,
      userId: req.user._id,
    };
    if (!req.user.isAdmin) throw new Error('Unauthorized');
    return this.aheadService.addToAhead(aheadData);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async removeToAheads(@Param('id') eventId: string, @Req() req): Promise<any> {
    if (!req.user.isAdmin) throw new Error('Unauthorized');
    return this.aheadService.removeToAheads(eventId);
  }

  @Get('ahead-all')
  async getAllAheadEvent(): Promise<any> {
    return this.aheadService.getAllAheadEvent();
  }

  @Get('ahead-city/:id')
  async getAheadEventOfCity(@Param('id') cityId: string): Promise<any> {
    return this.aheadService.getAheadEventOfCity(cityId);
  }

  @Get('ahead-country/:id')
  async getAheadEventOfCountry(@Param('id') countryId: string): Promise<any> {
    return this.aheadService.getAheadEventOfCountry(countryId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async chekIfEventIsInAhead(@Param('id') evenId: string): Promise<any> {
    return this.aheadService.chekIfEventIsInAheads(evenId);
  }
}
