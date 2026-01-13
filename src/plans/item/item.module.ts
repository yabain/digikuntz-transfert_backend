/* eslint-disable prettier/prettier */
import { Module, forwardRef } from '@nestjs/common';
import { ItemService } from './item.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemSchema } from './item.shema';
import { EmailService } from 'src/email/email.service';
import { PlansService } from '../plans.service';
import { PlansSchema } from '../plans.schema';
import { SubscriptionSchema } from '../subscription/subscription.schema';
import { TransactionModule } from 'src/transaction/transaction.module';

@Module({
  imports: [
    forwardRef(() => TransactionModule),
    MongooseModule.forFeature([
      { name: 'Item', schema: ItemSchema },
      { name: 'Plans', schema: PlansSchema },
      { name: 'Subscription', schema: SubscriptionSchema },
    ]),
  ],
  providers: [
    ItemService,
    EmailService,
    PlansService,
  ],
  exports: [ItemService],
})
export class ItemModule {}
