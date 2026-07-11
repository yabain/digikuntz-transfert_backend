import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Gateway, GatewaySchema } from './gateway.schema';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { AuthModule } from '../auth/auth.module';
import { DevModule } from '../dev/dev.module';

@Module({
  imports: [
    AuthModule,
    DevModule,
    MongooseModule.forFeature([{ name: Gateway.name, schema: GatewaySchema }]),
  ],
  controllers: [GatewayController],
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}
