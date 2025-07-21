import { Module } from '@nestjs/common';
import { CountryService } from './country.service';
import { CountryController } from './country.controller';
import { CountrySchema } from './country.schema';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'Country', schema: CountrySchema }]),
  ],
  providers: [CountryService],
  controllers: [CountryController],
})
export class CountryModule {}
