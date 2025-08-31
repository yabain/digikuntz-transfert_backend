import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from '../../user/user.schema';
import { UserService } from '../../user/user.service';
import { SubscriptionSchema } from './subscription.schema';
import { OptionsSchema } from '../options/options.shema';
import { OptionsService } from '../options/options.service';
import { ItemSchema } from '../item/item.shema';
import { ItemService } from '../item/item.service';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
import { PlansSchema } from '../plans.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    MongooseModule.forFeature([{ name: 'Options', schema: OptionsSchema }]),
    MongooseModule.forFeature([{ name: 'Item', schema: ItemSchema }]),
    MongooseModule.forFeature([{ name: 'Plans', schema: PlansSchema }]),
    MongooseModule.forFeature([
      { name: 'Subscription', schema: SubscriptionSchema },
    ]),
  ],
  providers: [
    SubscriptionService,
    UserService,
    OptionsService,
    ItemService,
    EmailService,
    DateService,
  ],
  controllers: [SubscriptionController],
})
export class SubscriptionModule {}
