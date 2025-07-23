import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { DateService } from './date.service';
import { User, UserSchema } from 'src/user/user.schema';
import { ConfigModule } from '@nestjs/config';
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [EmailService, DateService],
  controllers: [EmailController],
})
export class EmailModule {}
