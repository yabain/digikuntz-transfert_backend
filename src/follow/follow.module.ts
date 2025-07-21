import { Module } from '@nestjs/common';
import { FollowService } from './follow.service';
import { FollowController } from './follow.controller';
import { Follow, FollowSchema } from './follow.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Follow.name, schema: FollowSchema }]),
  ],
  providers: [FollowService],
  controllers: [FollowController],
})
export class FollowModule {}
