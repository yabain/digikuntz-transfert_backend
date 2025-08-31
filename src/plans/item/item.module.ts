/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ItemService } from './item.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemSchema } from './item.shema';
import { EmailService } from 'src/email/email.service';
import { PlansService } from '../plans.service';
import { PlansSchema } from '../plans.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Item', schema: ItemSchema },
    ]),
    MongooseModule.forFeature([
      { name: 'Plans', schema: PlansSchema },
    ]),
  ],
  providers: [
    ItemService,
    EmailService,
    PlansService,
  ],
})
export class ItemModule {}
