import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MpesaService } from './mpesa.service';
import { MpesaController } from './mpesa.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Payin, PayinSchema } from 'src/payin/payin.schema';
import { Payout, PayoutSchema } from 'src/payout/payout.schema';
import { Gateway, GatewaySchema } from 'src/gateway/gateway.schema';
import { CryptService } from 'src/dev/crypt.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: Payin.name, schema: PayinSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Gateway.name, schema: GatewaySchema },
    ]),
  ],
  controllers: [MpesaController],
  providers: [MpesaService, CryptService],
  exports: [MpesaService],
})
export class MpesaModule {}
