import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { UserSchema } from 'src/user/user.schema';
import { OptionsSchema } from './options/options.shema';
import { ItemSchema } from './item/item.shema';
import { PlansSchema } from './plans.schema';
import { UserService } from 'src/user/user.service';
import { DateService } from 'src/email/date.service';
import { EmailService } from 'src/email/email.service';
import { ItemService } from './item/item.service';
import { OptionsService } from './options/options.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    MongooseModule.forFeature([{ name: 'Options', schema: OptionsSchema }]),
    MongooseModule.forFeature([{ name: 'Item', schema: ItemSchema }]),
    MongooseModule.forFeature([{ name: 'Plans', schema: PlansSchema }]),
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
