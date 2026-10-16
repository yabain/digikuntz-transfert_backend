import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/user/user.schema';
import { CommissionResolverService } from './commission-resolver.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [CommissionResolverService],
  exports: [CommissionResolverService],
})
export class CommissionResolverModule {}