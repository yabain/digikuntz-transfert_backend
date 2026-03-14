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

@Module({
  imports: [
    UserModule,
    BalanceModule,
    forwardRef(() => FlutterwaveModule),
    MongooseModule.forFeature([
      { name: PaymentRequest.name, schema: PaymentRequestSchema },
    ]),
  ],
  controllers: [PaymentRequestController],
  providers: [PaymentRequestService],
  exports: [PaymentRequestService],
})
export class PaymentRequestModule {}
