import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { TrackVisitDto } from './dto/track-visit.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

@ApiTags('tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private trackingService: TrackingService) {}

  @Post('visit')
  @ApiOperation({ summary: 'Track a page visit (public)' })
  @ApiBody({ type: TrackVisitDto })
  @ApiResponse({ status: 201, description: 'Visit tracked.' })
  @UsePipes(ValidationPipe)
  async trackVisit(@Body() dto: TrackVisitDto, @Req() req: Request): Promise<void> {
    return this.trackingService.track(dto, req);
  }

  @Get('stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get tracking statistics (admin only)' })
  @ApiQuery({ name: 'period', required: false, type: String })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Tracking statistics.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getStats(
    @Query('period') period: string,
    @Query('date') date: string,
    @Req() req,
  ): Promise<any> {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.trackingService.stats(period || 'day', date || '');
  }
}
