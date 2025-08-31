import { Module } from '@nestjs/common';
import { SoldeService } from './solde.service';
import { SoldeController } from './solde.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { SoldeSchema } from './solde.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Solde', schema: SoldeSchema }]),
  ],
  providers: [SoldeService],
  controllers: [SoldeController],
})
export class SoldeModule {}
