import { Module, Options } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../user/user.schema';
import { UserService } from '../../user/user.service';
import { Subscription, SubscriptionSchema } from './subscription.schema';
import { OptionsSchema } from '../options/options.shema';
import { OptionsService } from '../options/options.service';
import { Item, ItemSchema } from '../item/item.shema';
import { ItemService } from '../item/item.service';
import { EmailService } from 'src/email/email.service';
import { DateService } from 'src/email/date.service';
import { Plans, PlansSchema } from '../plans.schema';
import { MailSchema, Mail } from 'src/email/mail.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: 'Options', schema: OptionsSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Plans.name, schema: PlansSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Mail.name, schema: MailSchema },
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
