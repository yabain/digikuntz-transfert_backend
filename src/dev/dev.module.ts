import { Module, forwardRef } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Dev, DevSchema } from './dev.schema';
import { TransactionModule } from 'src/transaction/transaction.module';
import { PayinModule } from 'src/payin/payin.module';
import { FlutterwaveModule } from 'src/flutterwave/flutterwave.module';
import { UserModule } from 'src/user/user.module';
import { SystemModule } from 'src/system/system.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => TransactionModule),
    forwardRef(() => PayinModule),
    forwardRef(() => FlutterwaveModule),
    forwardRef(() => UserModule),
    forwardRef(() => SystemModule),
    MongooseModule.forFeature([{ name: 'Dev', schema: DevSchema }]),
  ],
  providers: [DevService],
  controllers: [DevController],
})
export class DevModule {}
