// calendar.service.ts
import { Injectable } from '@nestjs/common';
import { createEvent } from 'ics';
import { writeFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class CalendarService {
  async generateIcsFile(options: {
    title: string;
    description: string;
    location: string;
    start: Date;
    end: Date;
    organizer?: { name: string; email: string };
  }): Promise<string> {
    const { title, description, location, start, end, organizer } = options;

    const event: any = {
      title,
      description,
      location,
      start: [
        start.getFullYear(),
        start.getMonth() + 1,
        start.getDate(),
        start.getHours(),
        start.getMinutes(),
      ],
      end: [
        end.getFullYear(),
        end.getMonth() + 1,
        end.getDate(),
        end.getHours(),
        end.getMinutes(),
      ],
      organizer,
    };

    return new Promise((resolve, reject) => {
      createEvent(event, (error, value) => {
        if (error) {
          reject(error);
        } else {
          const filePath = join(__dirname, '../../tmp/event.ics');
          writeFileSync(filePath, value);
          resolve(filePath);
        }
      });
    });
  }
}
