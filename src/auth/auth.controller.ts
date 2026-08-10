/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
 
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBody, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CreateUserDto } from 'src/user/create-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { SignInDto } from './dto/sign-in.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Register a new user
   * @param userData User registration data
   * @returns JWT token
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
  @ApiResponse({ status: 409, description: 'Registration failed.' })
  signUp(@Body() userData: CreateUserDto): Promise<any> {
    return this.authService.signUp(userData);
  }

  /**
   * Sign in a user
   * @param authData User credentials
   * @returns JWT token
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('/signin')
  @ApiOperation({
    summary: 'Sign in a user',
    description: 'Authenticates user credentials and returns an access token.',
  })
  @ApiBody({ type: SignInDto })
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
  signIn(@Body() authData: SignInDto, @Req() req: Request): Promise<any> {
    return this.authService.signIn(authData, req);
  }

  /**
   * Verify a two-factor authentication code
   * @param data 2FA challenge token and 6-digit code
   * @returns JWT token and user data
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-2fa')
  @ApiOperation({
    summary: 'Verify a two-factor authentication code',
    description:
      'Completes the two-factor authentication step after a successful sign-in using the 6-digit code sent by email.',
  })
  @ApiBody({ type: VerifyTwoFactorDto })
  @ApiResponse({
    status: 200,
    description: 'Code verified. Token and user data returned.',
    schema: {
      example: {
        userData: {},
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired code or challenge.' })
  async verifyTwoFactor(@Body() data: VerifyTwoFactorDto) {
    return this.authService.verifyTwoFactor(data.challengeToken, data.code);
  }

  /**
   * Logout a user
   * @param authData JWT token
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('/logout')
  @ApiOperation({
    summary: 'Logout a user',
    description: 'Revokes the provided JWT token (blacklist strategy).',
  })
  @ApiBody({ type: LogoutDto })
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
  logout(@Body() authData: LogoutDto): Promise<any> {
    const token: string = authData.token;
    return this.authService.logout(token);
  }

  /**
   * Request a password reset email
   * @param data User email
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-password-reset')
  @ApiOperation({
    summary: 'Request a password reset email',
    description: 'Sends a password reset email and WhatsApp notification if configured.',
  })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiResponse({
    status: 200,
    description: 'Reset password link sent.',
    schema: {
      example: {
        message: 'Reset password link sent',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid email.' })
  async requestPasswordReset(@Body() data: RequestPasswordResetDto) {
    const email = data.email;
    return this.authService.requestPasswordReset(email);
  }

  /**
   * Verify a password reset token
   * @param data Reset token
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('verify-token')
  @ApiOperation({
    summary: 'Verify a password reset token',
    description: 'Checks whether a reset password token is valid and not expired.',
  })
  @ApiBody({ type: VerifyTokenDto })
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
  async verifyResetPwdToken(@Body() data: VerifyTokenDto) {
    const token = data.token;
    return this.authService.verifyResetPwdToken(token);
  }

  /**
   * Reset password with token
   * @param data Reset token and new password
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password with token',
    description: 'Resets the user password using a valid reset token.',
  })
  @ApiBody({ type: ResetPasswordDto })
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
  async resetPassword(@Body() data: ResetPasswordDto) {
    return this.authService.resetPassword(data.token, data.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Change authenticated user password',
    description: 'Changes the authenticated user password after checking the current password.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed.' })
  @ApiResponse({ status: 400, description: 'Invalid password policy.' })
  @ApiResponse({ status: 401, description: 'Current password invalid.' })
  async changePassword(@Req() req: any, @Body() data: ChangePasswordDto) {
    return this.authService.changePassword(req.user._id, data.currentPassword, data.newPassword);
  }
}