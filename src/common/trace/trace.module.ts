import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TraceService } from './trace.service';
import { TraceMiddleware } from './trace.middleware';

@Module({
  providers: [TraceService],
  exports: [TraceService],
})
export class TraceModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
