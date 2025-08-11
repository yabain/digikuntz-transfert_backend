/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from 'src/user/create-user.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Register a new user
   * @param userData User registration data
   * @returns JWT token
   */
  @Post('/signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'User registered and token returned.',
  })
  signUp(@Body() userData: CreateUserDto): Promise<{ token: string }> {
    return this.authService.signUp(userData);
  }

  /**
   * Sign in a user
   * @param authData User credentials
   * @returns JWT token
   */
  @Post('/signin')
  @ApiOperation({ summary: 'Sign in a user' })
  @ApiBody({
    schema: { example: { email: 'user@mail.com', password: 'string' } },
  })
  @ApiResponse({
    status: 200,
    description: 'User signed in and token returned.',
  })
  signIn(@Body() authData: any): Promise<{ token: string }> {
    return this.authService.signIn(authData);
  }

  /**
   * Logout a user
   * @param authData JWT token
   */
  @Post('/logout')
  @ApiOperation({ summary: 'Logout a user' })
  @ApiBody({ schema: { example: { token: 'jwt-token' } } })
  @ApiResponse({ status: 200, description: 'User logged out.' })
  logout(@Body() authData: any): Promise<any> {
    const token: any = authData.token;
    return this.authService.logout(token);
  }

  /**
   * Request a password reset email
   * @param data User email
   */
  @Post('request-password-reset')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiBody({ schema: { example: { email: 'user@mail.com' } } })
  @ApiResponse({ status: 200, description: 'Password reset email sent.' })
  async requestPasswordReset(@Body() data: any) {
    const email = data.email;
    return this.authService.requestPasswordReset(email);
  }

  /**
   * Verify a password reset token
   * @param data Reset token
   */
  @Post('verify-token')
  @ApiOperation({ summary: 'Verify a password reset token' })
  @ApiBody({ schema: { example: { token: 'reset-token' } } })
  @ApiResponse({ status: 200, description: 'Token is valid.' })
  async verifyResetPwdToken(@Body() data: any) {
    const token = data.token;
    return this.authService.verifyResetPwdToken(token);
  }

  /**
   * Reset password with token
   * @param data Reset token and new password
   */
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiBody({
    schema: { example: { token: 'reset-token', password: 'newPassword' } },
  })
  @ApiResponse({ status: 200, description: 'Password has been reset.' })
  async resetPassword(@Body() data: any) {
    return this.authService.resetPassword(data.token, data.password);
  }
}
