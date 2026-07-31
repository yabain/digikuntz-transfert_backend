import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { InvoiceCron } from './invoice.cron';
import { UserModule } from 'src/user/user.module';
import { SystemModule } from 'src/system/system.module';
import { PaymentMethodModule } from 'src/payment-method/payment-method.module';
import { FlutterwaveModule } from 'src/flutterwave/flutterwave.module';
import { Transaction, TransactionSchema } from 'src/transaction/transaction.schema';
import { Payin, PayinSchema } from 'src/payin/payin.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Payin.name, schema: PayinSchema },
    ]),
    forwardRef(() => UserModule),
    SystemModule,
    PaymentMethodModule,
    forwardRef(() => FlutterwaveModule),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoiceCron],
  exports: [InvoiceService],
})
export class InvoiceModule {}
