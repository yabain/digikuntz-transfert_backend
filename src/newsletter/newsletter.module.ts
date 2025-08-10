import { Module } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsletterSchema } from './newsletter.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'Newsletter', schema: NewsletterSchema },
    ]),
  ],
  providers: [NewsletterService],
  controllers: [NewsletterController],
})
export class NewsletterModule {}
