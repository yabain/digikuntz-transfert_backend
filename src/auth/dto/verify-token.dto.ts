import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyTokenDto {
  @ApiProperty({ example: 'reset-token-or-jwt' })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token: string;
}
