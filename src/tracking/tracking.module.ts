import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { VisitEvent, VisitEventSchema } from './visit-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VisitEvent.name, schema: VisitEventSchema },
    ]),
  ],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
