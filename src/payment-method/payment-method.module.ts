import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethod, PaymentMethodSchema } from './payment-method.schema';
import { PaymentMethodService } from './payment-method.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: PaymentMethod.name, schema: PaymentMethodSchema },
    ]),
  ],
  controllers: [PaymentMethodController],
  providers: [PaymentMethodService],
  exports: [PaymentMethodService],
})
export class PaymentMethodModule {}

