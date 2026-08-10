import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty({ example: 'jwt-challenge-token' })
  @IsString()
  @IsNotEmpty({ message: 'Challenge token is required' })
  challengeToken: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be exactly 6 digits' })
  code: string;
}
