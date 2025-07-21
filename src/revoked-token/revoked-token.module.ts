import { Module } from '@nestjs/common';
import { RevokedTokenService } from './revoked-token.service';
import { MongooseModule } from '@nestjs/mongoose';
import { RevokedToken, RevokedTokenSchema } from './revoked-token.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RevokedToken.name, schema: RevokedTokenSchema },
    ]),
  ],
  providers: [RevokedTokenService],
})
export class RevokedTokenModule {}
