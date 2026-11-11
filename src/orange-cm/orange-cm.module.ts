import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { OrangeCmService } from './orange-cm.service';
import { OrangeCmController } from './orange-cm.controller';
import { Payin, PayinSchema } from 'src/payin/payin.schema';
import { Gateway, GatewaySchema } from 'src/gateway/gateway.schema';
import { CryptService } from 'src/dev/crypt.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: Payin.name, schema: PayinSchema },
      { name: Gateway.name, schema: GatewaySchema },
    ]),
  ],
  controllers: [OrangeCmController],
  providers: [OrangeCmService, CryptService],
  exports: [OrangeCmService],
})
export class OrangeCmModule {}