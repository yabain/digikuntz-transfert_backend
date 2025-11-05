/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { OptionsServiceService } from './options-service.service';
import { MongooseModule } from '@nestjs/mongoose';
import { OptionsServiceSchema } from './options-service.shema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OptionsServiceService.name, schema: OptionsServiceSchema },
    ]),
  ],
  providers: [OptionsServiceService],
})
export class OptionsServiceModule {}
