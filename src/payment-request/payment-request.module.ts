import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlutterwaveModule } from 'src/flutterwave/flutterwave.module';
import { UserModule } from 'src/user/user.module';
import { BalanceModule } from 'src/balance/balance.module';
import {
  PaymentRequest,
  PaymentRequestSchema,
} from './payment-request.schema';
import { PaymentRequestService } from './payment-request.service';
import { PaymentRequestController } from './payment-request.controller';
import { PaymentRequestCron } from './payment-request.cron';
import { Transaction, TransactionSchema } from 'src/transaction/transaction.schema';

@Module({
  imports: [
    forwardRef(() => UserModule),
    BalanceModule,
    forwardRef(() => FlutterwaveModule),
    MongooseModule.forFeature([
      { name: PaymentRequest.name, schema: PaymentRequestSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  controllers: [PaymentRequestController],
  providers: [PaymentRequestService, PaymentRequestCron],
  exports: [PaymentRequestService],
})
export class PaymentRequestModule {}
