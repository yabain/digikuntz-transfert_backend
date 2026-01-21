import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSchema } from './system.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'System', schema: SystemSchema }])],
  providers: [SystemService],
  controllers: [SystemController],
  exports: [SystemService],
})
export class SystemModule {}
