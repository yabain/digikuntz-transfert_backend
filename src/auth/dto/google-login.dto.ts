import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ example: 'google-id-token-from-client' })
  @IsString()
  @IsNotEmpty({ message: 'Google ID token is required' })
  idToken: string;
}