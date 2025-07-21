/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetaService } from './meta.service';

@Controller('event_data')
export class MetaController {
  constructor(private metaService: MetaService) {}

  @Get(':id')
  async getEventMeta(
    @Param('id') eventId: string,
    @Res() res: Response,
    @Req() req,
  ) {
    console.log('eventId', eventId);
    return this.metaService.getEventMeta(eventId, res, req);
  }

  @Get('ticket/:id')
  async getTicketMeta(
    @Param('id') ticketId: string,
    @Res() res: Response,
    @Req() req,
  ) {
    console.log('ticketId', ticketId);
    return this.metaService.getTicketMeta(ticketId, res, req);
  }
}
