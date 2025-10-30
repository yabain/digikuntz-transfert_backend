import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UserSettingsService } from './userSettings.service';
import { UserSettingsController } from './userSettings.controller';
import { UserSettings, UserSettingsSchema } from './userSettings.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: UserSettings.name, schema: UserSettingsSchema }]),
  ],
  controllers: [UserSettingsController],
  providers: [UserSettingsService],
  exports: [UserSettingsService],
})
export class UserSettingsModule {}
