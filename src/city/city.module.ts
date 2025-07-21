import { Module } from '@nestjs/common';
import { CityService } from './city.service';
import { CityController } from './city.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { CitySchema } from './city.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'City', schema: CitySchema }]),
  ],
  providers: [CityService],
  controllers: [CityController],
})
export class CityModule {}
