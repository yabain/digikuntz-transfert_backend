import { Module, forwardRef } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutController } from './payout.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Payin, PayinSchema } from 'src/payin/payin.schema';
import {
  Transaction,
  TransactionSchema,
} from 'src/transaction/transaction.schema';
import { Payout, PayoutSchema } from './payout.schema';
import { TransactionService } from 'src/transaction/transaction.service';
import { PayoutCron } from './payout.cron';
import { PayinService } from 'src/payin/payin.service';
import { WhatsappModule } from 'src/wa/whatsapp.module';
import { EmailModule } from 'src/email/email.module';
import { PlansModule } from 'src/plans/plans.module';
import { UserModule } from 'src/user/user.module';
import { SystemModule } from 'src/system/system.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    forwardRef(() => WhatsappModule),
    forwardRef(() => SystemModule),
    forwardRef(() => EmailModule),
    forwardRef(() => PlansModule),
    forwardRef(() => UserModule),
    MongooseModule.forFeature([
      { name: Payin.name, schema: PayinSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  providers: [
    PayoutService,
    PayinService,
    TransactionService,
    PayoutCron
  ],
  controllers: [PayoutController],
  exports: [PayoutService],
})
export class PayoutModule { }
