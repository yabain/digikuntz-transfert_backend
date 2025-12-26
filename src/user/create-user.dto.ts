/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { UserType } from './user.schema';
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

export class CreateUserDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly id: string;

  @ApiProperty({ example: 'john.doe@email.com' })
  @IsEmail()
  @IsNotEmpty()
  readonly email: string;

  @ApiProperty()
  @IsNotEmpty()
  readonly balance: number;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  readonly password: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsNotEmpty()
  readonly agreeTerms: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass verified' })
  @IsOptional()
  readonly verified: boolean;

  @IsEmpty({ message: 'You cannot pass resetPasswordToken' })
  @IsOptional()
  readonly resetPasswordToken: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass vip' })
  @IsOptional()
  readonly vip: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass warning' })
  @IsOptional()
  readonly warning: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass isAdmin' })
  @IsOptional()
  readonly isAdmin: boolean;

  @ApiProperty({ example: 'male' })
  @IsString()
  @IsOptional()
  readonly gender: string; // male or female

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass isAdmin' })
  @IsOptional()
  readonly isActive: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass premium' })
  @IsOptional()
  readonly premium: boolean;

  @ApiProperty({ example: 'personal' })
  @IsEnum(UserType, {
    message: 'Enter corect userType : personal or prganisation',
  })
  @IsNotEmpty()
  readonly accountType: UserType;

  @ApiProperty({ example: 'Software developer' })
  @IsString()
  @IsOptional()
  readonly description: string;

  @ApiProperty({ example: 'cityId' })
  @IsString()
  @IsNotEmpty()
  readonly cityId: string;

  @ApiProperty({ example: 'countryId' })
  @IsString()
  @IsNotEmpty()
  readonly countryId: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  readonly phone: string;

  @ApiProperty({ example: 'en' })
  @IsString()
  @IsNotEmpty()
  readonly language: string;

  @ApiProperty({ example: 'Flambel' })
  @IsString()
  @IsOptional()
  readonly firstName: string;

  @ApiProperty({ example: 'SANOU' })
  @IsString()
  @IsOptional()
  readonly lastName: string;

  @ApiProperty({ example: 'Yaba-In' })
  @IsString()
  @IsOptional()
  readonly name: string;

  @ApiProperty({ example: 'http://example.com/johndoe.jpg' })
  @IsString()
  @IsOptional()
  readonly pictureUrl: string;

  @ApiProperty({ example: 'http://example.com/cover.jpg' })
  @IsString()
  @IsOptional()
  readonly coverUrl: string;

  @ApiProperty({ example: '0987654321' })
  @IsString()
  @IsOptional()
  readonly phone2: string;

  @ApiProperty({ example: '+237 123456789' })
  @IsString()
  @IsOptional()
  readonly whatsapp: string;

  @ApiProperty({ example: 'http://twitter.com/johndoe' })
  @IsString()
  @IsOptional()
  readonly twitter: string;

  @ApiProperty({ example: 'http://instagram.com/johndoe' })
  @IsString()
  @IsOptional()
  readonly instagram: string;

  @ApiProperty({ example: 'http://facebook.com/johndoe' })
  @IsString()
  @IsOptional()
  readonly facebook: string;

  @ApiProperty({ example: 'http://example.com' })
  @IsString()
  @IsOptional()
  readonly webSite: string;

  @ApiProperty({ example: 'http://linkedin.com/in/johndoe' })
  @IsString()
  @IsOptional()
  readonly linkedIn: string;

  @ApiProperty({ example: '123 Main St, Anytown, USA' })
  @IsString()
  @IsOptional()
  readonly address: string;
}
