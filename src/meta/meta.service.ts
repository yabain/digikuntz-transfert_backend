/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { EventService } from 'src/event/event.service';
import * as mongoose from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { TicketService } from 'src/ticket/ticket.service';

@Injectable()
export class MetaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    private readonly ticketService: TicketService,
  ) {}

  async getEventMeta(eventId, res, req): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Invalid event ID');
    }
    const event = await this.eventService.findById(eventId);
    if (!event) {
      return res.redirect(this.configService.get<string>('FRONT_URL'));
    }

    // Checks if the request comes from a social network crawler
    const userAgent = req.headers['user-agent']?.toLowerCase() || '';
    const isSocialMediaBot =
      /facebook|messenger|twitter|whatsapp|linkedin|pinterest|slack|telegram|instagram|discord/i.test(
        userAgent,
      );

    if (isSocialMediaBot) {
      const html = `
          <!DOCTYPE html>
          <html prefix="og: https://ogp.me/ns#">
          <head>
            <title>${event.title}</title>
            <meta property="og:title" content="${event.title}" />
            <meta property="og:description" content="${event.description}" />
            <meta property="og:type" content="website" />
            <meta property="og:url" content="${this.configService.get<string>('FRONT_URL')}/tabs/events/${eventId}_shared" />
            <meta property="og:image" content="${event.cover}" />
            <meta property="og:site_name" content="Yabi Events" />
            <meta name="twitter:card" content="summary_large_image">
          </head>
          <body>
            <script>
              window.location.href = "${this.configService.get<string>('FRONT_URL')}/tabs/events/${eventId}_shared";
            </script>
          </body>
          </html>
          `;
      return res.send(html);
    }
    
    // Redirection normale pour les navigateurs
    return res.redirect(
      `${this.configService.get<string>('FRONT_URL')}/tabs/events/${eventId}_shared`,
    );
  }

  async getTicketMeta(data, res, req): Promise<any> {
    const ticketId = data.split('azerty')[0];
    const encrypted = data.split('azerty')[1];
    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      throw new NotFoundException('Invalid event ID');
    }
    const ticket = await this.ticketService.getTicketData(ticketId);
    if (!ticket) {
      return res.redirect(this.configService.get<string>('FRONT_URL'));
    }

    console.log('data', data);
    console.log('encrypted', encrypted);
    console.log('ticket', ticket);
    // Checks if the request comes from a social network crawler
    const userAgent = req.headers['user-agent']?.toLowerCase() || '';
    const isSocialMediaBot =
      /facebook|messenger|twitter|whatsapp|linkedin|pinterest|slack|telegram|instagram|discord/i.test(
        userAgent,
      );

    if (isSocialMediaBot) {
      const html = `
          <!DOCTYPE html>
          <html prefix="og: https://ogp.me/ns#">
          <head>
            <title>Yabi Ticket for ${ticket.eventId.title}</title>
            <meta property="og:title" content="Yabi Ticket for ${ticket.eventId.title}" />
            <meta property="og:description" content="${ticket.eventId.description}" />
            <meta property="og:type" content="website" />
            <meta property="og:url" content="${this.configService.get<string>('FRONT_URL')}/scanner/transfert-ticket/${encrypted}" />
            <meta property="og:image" content="${this.configService.get<string>('BACK_URL')}/uploads/ticket.png" />
            <meta property="og:site_name" content="Yabi Events" />
            <meta name="twitter:card" content="summary_large_image">
          </head>
          <body>
            <script>
              window.location.href = "${this.configService.get<string>('FRONT_URL')}/scanner/transfert-ticket/${encrypted}";
            </script>
          </body>
          </html>
          `;

      return res.send(html);
    }

    // Redirection normale pour les navigateurs
    return res.redirect(
      `${this.configService.get<string>('FRONT_URL')}/scanner/transfert-ticket/${encrypted}`,
    );
  }
}
