import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DistributedLock,
  DistributedLockSchema,
} from './distributed-lock.schema';
import { DistributedLockService } from './distributed-lock.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DistributedLock.name, schema: DistributedLockSchema },
    ]),
  ],
  providers: [DistributedLockService],
  exports: [DistributedLockService],
})
export class DistributedLockModule {}
