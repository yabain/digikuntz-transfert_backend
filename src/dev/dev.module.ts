import { Module, forwardRef } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Dev, DevSchema } from './dev.schema';
import { TransactionModule } from 'src/transaction/transaction.module';
import { PayinModule } from 'src/payin/payin.module';
import { FlutterwaveModule } from 'src/flutterwave/flutterwave.module';
import { UserModule } from 'src/user/user.module';
import { CryptService } from './crypt.service';
import { BalanceModule } from 'src/balance/balance.module';
import { PayoutModule } from 'src/payout/payout.module';
import { PaymentMethodModule } from 'src/payment-method/payment-method.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => TransactionModule),
    forwardRef(() => PayinModule),
    forwardRef(() => FlutterwaveModule),
    forwardRef(() => UserModule),
    forwardRef(() => BalanceModule),
    forwardRef(() => PayoutModule),
    forwardRef(() => PaymentMethodModule),
    MongooseModule.forFeature([{ name: 'Dev', schema: DevSchema }]),
  ],
  providers: [DevService, CryptService],
  controllers: [DevController],
  exports: [CryptService],
})
export class DevModule {}
