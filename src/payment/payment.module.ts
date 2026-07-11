import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Gateway, GatewaySchema } from '../gateway/gateway.schema';
import { DevModule } from '../dev/dev.module';
import { GatewayLoaderService } from './gateway-loader.service';
import { GatewayFactoryService } from './gateway-factory.service';
import { PaymentRouterService } from './payment-router.service';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { PaystackModule } from '../paystack/paystack.module';
import { MpesaModule } from '../mpesa/mpesa.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Gateway.name, schema: GatewaySchema }]),
    DevModule,
    forwardRef(() => FlutterwaveModule),
    forwardRef(() => PaystackModule),
    forwardRef(() => MpesaModule),
  ],
  providers: [GatewayLoaderService, GatewayFactoryService, PaymentRouterService],
  exports: [GatewayLoaderService, GatewayFactoryService, PaymentRouterService],
})
export class PaymentModule {}
