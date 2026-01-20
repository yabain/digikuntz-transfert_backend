/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { User } from 'src/user/user.schema';

export class UpdateDevDto {
  @IsEmpty({ message: 'You cannot pass dev id' })
  readonly id: string;

  @IsEmpty()
  userId: User;

  @IsString()
  @IsOptional()
  publicKey: string;

  @IsString()
  @IsOptional()
  secretKey: string;

  @IsBoolean()
  @IsOptional()
  status: boolean;

  @IsString()
  @IsOptional()
  @MinLength(6)
  apiPassword: string;
}
