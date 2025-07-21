import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './user.schema';
import { AuthModule } from '../auth/auth.module';
import { FollowService } from 'src/follow/follow.service';
import { Follow, FollowSchema } from '../follow/follow.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Follow.name, schema: FollowSchema }]),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
  ],
  controllers: [UserController],
  providers: [UserService, FollowService],
  exports: [UserService],
})
export class UserModule {}
