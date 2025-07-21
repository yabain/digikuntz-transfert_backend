/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

import { TicketClasses } from '../ticket-classes/ticket-classes.shema';
import { UpdateTicketClassesDto } from './update-ticket-classes.dto';

@Injectable()
export class TicketClassesService {
  constructor(
    @InjectModel(TicketClasses.name)
    private ticketClassesModel: mongoose.Model<TicketClasses>,
  ) {}

  async creatTicketClass(ticketClasses: any, eventId: any): Promise<any> {
    ticketClasses = JSON.parse(ticketClasses);
    let res: any[] = [];
    for (const ticketClass of ticketClasses) {
      const classData: any = { ...ticketClass, eventId: eventId };
      const addData = await this.ticketClassesModel.create(classData);
      res = [...res, addData];
    }

    return res;
  }

  async findByEventId(id): Promise<TicketClasses[]> {
    let eventId: any = id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      eventId = new mongoose.Types.ObjectId(id);
    }

    const ticketClasses = await this.ticketClassesModel
      .find({ eventId: eventId })
      .exec();

    return ticketClasses;
  }

  async updateTicketClasse(ticketClasseId: any, ticketClasseData: any) {
    const ticketClasse = await this.ticketClassesModel.findByIdAndUpdate(
      ticketClasseId,
      ticketClasseData,
      {
        new: true,
        runValidators: true,
      },
    );
    return ticketClasse;
  }
}
