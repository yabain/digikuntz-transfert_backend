import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSchema } from './system.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'System', schema: SystemSchema }]),
  ],
  providers: [SystemService],
  controllers: [SystemController],
})
export class SystemModule {}
