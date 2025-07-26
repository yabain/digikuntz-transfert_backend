import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { Exchange, ExchangeSchema } from './exchange.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { ExchangeService } from './exchange.service';
import { ExchangeController } from './exchange.controller';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: Exchange.name, schema: ExchangeSchema },
    ]),
  ],
  providers: [ExchangeService],
  controllers: [ExchangeController],
})
export class ExchangeModule {}
