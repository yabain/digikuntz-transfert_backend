import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MpesaService } from './mpesa.service';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [MpesaService],
  exports: [MpesaService],
})
export class MpesaModule {}

