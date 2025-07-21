/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from 'src/user/create-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('/signup')
  signUp(@Body() userData: CreateUserDto): Promise<{ token: string }> {
    // console.log('SignUp of new user');
    return this.authService.signUp(userData);
  }

  @Post('/signin')
  signIn(@Body() authData: any): Promise<{ token: string }> {
    return this.authService.signIn(authData);
  }

  @Post('/logout')
  logout(@Body() authData: any): Promise<any> {
    const token: any = authData.token;
    return this.authService.logout(token);
  }

  @Post('request-password-reset')
  async requestPasswordReset(@Body() data: any) {
    const email = data.email;
    // console.log('email: ', email);
    return this.authService.requestPasswordReset(email);
  }

  @Post('verify-token')
  async verifyResetPwdToken(@Body() data: any) {
    // console.log('data: ', data);
    const token = data.token;
    // console.log('token: ', token);
    return this.authService.verifyResetPwdToken(token);
  }

  @Post('reset-password')
  async resetPassword(@Body() data: any) {
    return this.authService.resetPassword(data.token, data.password);
  }
  // @Post('test')
  // async test(@Body('email') email: string) {
  //   return this.authService.testMail(email);
  // }
}
