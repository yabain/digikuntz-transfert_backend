import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PaystackController } from './paystack.controller';
import { PaystackService } from './paystack.service';
import { Gateway, GatewaySchema } from 'src/gateway/gateway.schema';
import { CryptService } from 'src/dev/crypt.service';

@Module({
  imports: [ConfigModule, HttpModule, MongooseModule.forFeature([{ name: Gateway.name, schema: GatewaySchema }])],
  controllers: [PaystackController],
  providers: [PaystackService, CryptService],
  exports: [PaystackService],
})
export class PaystackModule {}
