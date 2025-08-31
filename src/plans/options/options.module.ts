/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { OptionsService } from './options.service';
import { MongooseModule } from '@nestjs/mongoose';
import { OptionsSchema } from './options.shema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Options', schema: OptionsSchema },
    ]),
  ],
  providers: [OptionsService],
})
export class OptionsModule {}
