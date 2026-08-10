import { Module, forwardRef } from '@nestjs/common';
import { ServicePaymentService } from './service-payment.service';
import { ServicePaymentController } from './service-payment.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../user/user.schema';
import { UserService } from '../../user/user.service';
import { ServicePayment, ServicePaymentSchema } from './service-payment.schema';
import {
  OptionsServiceSchema,
  OptionsService,
} from '../options-service/options-service.shema';
import { OptionsServiceService } from '../options-service/options-service.service';
import { Service, ServiceSchema } from '../service.schema';
import { EmailSchema, Email } from 'src/email/email.schema';
import { Smtp, SmtpSchema } from 'src/email/smtp/smtp.schema';
import { WhatsappModule } from 'src/wa/whatsapp.module';
import { AppCacheModule } from '../../cache/cache.module';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    EmailModule,
    forwardRef(() => AuthModule),
    forwardRef(() => WhatsappModule),
    AppCacheModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: OptionsService.name, schema: OptionsServiceSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: ServicePayment.name, schema: ServicePaymentSchema },
      { name: Email.name, schema: EmailSchema },
      { name: Smtp.name, schema: SmtpSchema },
    ]),
  ],
  providers: [ServicePaymentService, UserService, OptionsServiceService],
  controllers: [ServicePaymentController],
  exports: [ServicePaymentService],
})
export class ServicePaymentModule {}
