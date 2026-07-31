import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { BalanceController } from './balance.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Balance, BalanceSchema } from './balance.schema';
import {
  BalanceMovement,
  BalanceMovementSchema,
} from './balance-movement.schema';
import { UserService } from 'src/user/user.service';
import { UserSchema } from 'src/user/user.schema';
import { AppCacheModule } from '../cache/cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Balance.name, schema: BalanceSchema },
      { name: BalanceMovement.name, schema: BalanceMovementSchema },
      { name: 'User', schema: UserSchema },
    ]),
    AppCacheModule,
  ],
  providers: [BalanceService, UserService],
  controllers: [BalanceController],
  exports: [BalanceService, MongooseModule],
})
export class BalanceModule {}
