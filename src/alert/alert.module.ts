import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { Alert, AlertSchema } from './alert.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Alert.name, schema: AlertSchema }]),
  ],
  providers: [AlertService],
  controllers: [AlertController],
})
export class AlertModule {}
