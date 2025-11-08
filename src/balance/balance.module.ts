import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { BalanceController } from './balance.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { BalanceSchema } from './balance.schema';
import { UserService } from 'src/user/user.service';
import { UserSchema } from 'src/user/user.schema';
import { AppCacheModule } from '../cache/cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Balance', schema: BalanceSchema },
      { name: 'User', schema: UserSchema }]),
    AppCacheModule,
  ],
  providers: [BalanceService, UserService],
  controllers: [BalanceController],
})
export class BalanceModule {}
