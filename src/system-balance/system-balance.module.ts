import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemBalance, SystemBalanceSchema } from './system-balance.schema';
import {
  SystemBalanceMovement,
  SystemBalanceMovementSchema,
} from './system-balance-movement.schema';
import { SystemBalanceService } from './system-balance.service';
import { SystemBalanceController } from './system-balance.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemBalance.name, schema: SystemBalanceSchema },
      {
        name: SystemBalanceMovement.name,
        schema: SystemBalanceMovementSchema,
      },
    ]),
  ],
  providers: [SystemBalanceService],
  controllers: [SystemBalanceController],
  exports: [SystemBalanceService, MongooseModule],
})
export class SystemBalanceModule {}
