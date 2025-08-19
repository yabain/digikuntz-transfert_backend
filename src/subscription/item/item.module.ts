/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ItemService } from './item.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemSchema } from './item.shema';
import { EmailService } from 'src/email/email.service';
import { SubscriptionService } from '../subscription.service';
import { SubscriptionSchema } from '../subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Item', schema: ItemSchema },
    ]),
    MongooseModule.forFeature([
      { name: 'Subscription', schema: SubscriptionSchema },
    ]),
  ],
  providers: [
    ItemService,
    EmailService,
    SubscriptionService,
  ],
})
export class ItemModule {}
