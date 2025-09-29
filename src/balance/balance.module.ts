import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { BalanceController } from './balance.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { BalanceSchema } from './balance.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Balance', schema: BalanceSchema }]),
  ],
  providers: [BalanceService],
  controllers: [BalanceController],
})
export class BalanceModule {}
