/* eslint-disable prettier/prettier */
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
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account and returns an authentication token.',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'User registered and token returned.',
    schema: {
      example: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error or invalid payload.' })
  @ApiResponse({ status: 409, description: 'User already exists.' })
  signUp(@Body() userData: CreateUserDto): Promise<{ token: string }> {
    return this.authService.signUp(userData);
  }

  /**
   * Sign in a user
   * @param authData User credentials
   * @returns JWT token
   */
  @Post('/signin')
  @ApiOperation({
    summary: 'Sign in a user',
    description: 'Authenticates user credentials and returns an access token.',
  })
  @ApiBody({
    schema: { example: { email: 'user@mail.com', password: 'string' } },
  })
  @ApiResponse({
    status: 200,
    description: 'User signed in and token returned.',
    schema: {
      example: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  signIn(@Body() authData: any): Promise<{ token: string }> {
    return this.authService.signIn(authData);
  }

  /**
   * Logout a user
   * @param authData JWT token
   */
  @Post('/logout')
  @ApiOperation({
    summary: 'Logout a user',
    description: 'Revokes the provided JWT token (blacklist strategy).',
  })
  @ApiBody({ schema: { example: { token: 'jwt-token' } } })
  @ApiResponse({
    status: 200,
    description: 'User logged out.',
    schema: {
      example: {
        message: 'Logged out successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Token missing or malformed.' })
  logout(@Body() authData: any): Promise<any> {
    const token: any = authData.token;
    return this.authService.logout(token);
  }

  /**
   * Request a password reset email
   * @param data User email
   */
  @Post('request-password-reset')
  @ApiOperation({
    summary: 'Request a password reset email',
    description: 'Sends a password reset email and WhatsApp notification if configured.',
  })
  @ApiBody({ schema: { example: { email: 'user@mail.com' } } })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent.',
    schema: {
      example: {
        message: 'Reset password link sent',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid email.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async requestPasswordReset(@Body() data: any) {
    const email = data.email;
    return this.authService.requestPasswordReset(email);
  }

  /**
   * Verify a password reset token
   * @param data Reset token
   */
  @Post('verify-token')
  @ApiOperation({
    summary: 'Verify a password reset token',
    description: 'Checks whether a reset password token is valid and not expired.',
  })
  @ApiBody({ schema: { example: { token: 'reset-token' } } })
  @ApiResponse({
    status: 200,
    description: 'Token is valid.',
    schema: {
      example: {
        valid: true,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Token missing or invalid.' })
  @ApiResponse({ status: 404, description: 'Token not found.' })
  async verifyResetPwdToken(@Body() data: any) {
    const token = data.token;
    return this.authService.verifyResetPwdToken(token);
  }

  /**
   * Reset password with token
   * @param data Reset token and new password
   */
  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password with token',
    description: 'Resets the user password using a valid reset token.',
  })
  @ApiBody({
    schema: { example: { token: 'reset-token', password: 'newPassword' } },
  })
  @ApiResponse({
    status: 200,
    description: 'Password has been reset.',
    schema: {
      example: {
        message: 'Password updated successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid token or password policy error.' })
  @ApiResponse({ status: 404, description: 'User not found for this token.' })
  async resetPassword(@Body() data: any) {
    return this.authService.resetPassword(data.token, data.password);
  }
}
