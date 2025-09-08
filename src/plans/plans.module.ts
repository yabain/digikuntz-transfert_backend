import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { UserSchema, User } from 'src/user/user.schema';
import { OptionsSchema, Options } from './options/options.shema';
import { ItemSchema, Item } from './item/item.shema';
import { PlansSchema, Plans } from './plans.schema';
import { UserService } from 'src/user/user.service';
import { DateService } from 'src/email/date.service';
import { EmailService } from 'src/email/email.service';
import { ItemService } from './item/item.service';
import { OptionsService } from './options/options.service';
import { MailSchema, Mail } from 'src/email/mail.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Options.name, schema: OptionsSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Plans.name, schema: PlansSchema },
      { name: Mail.name, schema: MailSchema },
    ]),
  ],
  providers: [
    PlansService,
    UserService,
    OptionsService,
    ItemService,
    EmailService,
    DateService,
  ],
  controllers: [PlansController],
})
export class PlansModule {}
