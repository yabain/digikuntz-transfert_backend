/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { User } from '../user/user.schema';
import { ConfigService } from '@nestjs/config';
import { RevokedToken } from 'src/revoked-token/revoked-token.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(RevokedToken.name)
    private revokedTokenModel: Model<RevokedToken>,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
      passReqToCallback: true, // Allows access to the full query
    });
  }

  async validate(req: any, payload: any) {
    const authHeader = String(req?.headers?.authorization || '');
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';

    if (token) {
      const revoked = await this.revokedTokenModel.exists({ token });
      if (revoked) {
        throw new UnauthorizedException();
      }
    }

    const user = await this.userModel.findById(payload.id);
    if (!user) {
      console.error('User not found for ID:', payload.id);
      throw new UnauthorizedException();
    }

    const userObj = user.toObject();
    userObj.password = '';
    userObj.resetPasswordToken = ''; // Remove the resetPasswordToken from the response for security
    return userObj;
  }
}
