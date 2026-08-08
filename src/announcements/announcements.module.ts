import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AnnouncementDelivery,
  AnnouncementDeliverySchema,
} from './announcement-delivery.schema';
import { Announcement, AnnouncementSchema } from './announcement.schema';
import {
  AnnouncementSettings,
  AnnouncementSettingsSchema,
} from './announcement-settings.schema';
import { User, UserSchema } from 'src/user/user.schema';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { ProspectsModule } from 'src/prospects/prospects.module';
import { EmailModule } from 'src/email/email.module';
import { DistributedLockModule } from 'src/distributed-lock/distributed-lock.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Announcement.name, schema: AnnouncementSchema },
      { name: AnnouncementDelivery.name, schema: AnnouncementDeliverySchema },
      { name: User.name, schema: UserSchema },
      { name: AnnouncementSettings.name, schema: AnnouncementSettingsSchema },
    ]),
    ProspectsModule,
    EmailModule,
    DistributedLockModule,
  ],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}