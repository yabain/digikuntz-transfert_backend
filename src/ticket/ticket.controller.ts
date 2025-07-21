/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateTicketDto } from './create-ticket.dto';
import { Response } from 'express';

@Controller('ticket')
export class TicketController {
  constructor(private ticketService: TicketService) {}

  @Get('all/:id')
  async getAllTicketsOfEvent(@Param('id') eventId: string): Promise<any> {
    return this.ticketService.getAllTicketsOfEvent(eventId);
  }

  @Get('myTicket/:id')
  @UseGuards(AuthGuard('jwt'))
  async getAllMyTickets(@Param('id') userId: string): Promise<any> {
    return this.ticketService.getAllMyTickets(userId);
  }

  @Get('ticketData/:id')
  @UseGuards(AuthGuard('jwt'))
  async getTicketData(@Param('id') ticketId: string): Promise<any> {
    return this.ticketService.getTicketData(ticketId);
  }

  @Post('new')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createFreeTicket(
    @Body() ticket: CreateTicketDto,
    @Req() req,
  ): Promise<any> {
    return this.ticketService.createFreeTicket(ticket, req.user, true);
  }

  @Get('participantStatus/:id')
  @UseGuards(AuthGuard('jwt'))
  async checkParticipantsStatus(
    @Param('id')
    eventId: string,
    @Req() req,
  ): Promise<any> {
    return this.ticketService.checkParticipantsStatus(eventId, req.user._id);
  }

  @Put('validation/:id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async ticketValidation(
    @Param('id') ticketId: string,
    @Req() req,
  ): Promise<any> {
    return this.ticketService.ticketValidation(ticketId, req.user._id);
  }

  @Put('transfert/:id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async ticketTransfert(
    @Param('id') ticketId: string,
    @Body() data: any,
    @Req() req,
  ): Promise<any> {
    return this.ticketService.ticketTransfert(
      ticketId,
      req.user._id,
      data.senderId,
    );
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
