import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({ example: 'jwt-token' })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token: string;
}
