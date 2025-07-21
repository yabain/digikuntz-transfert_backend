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

export class CreateUserDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly id: string;

  @IsEmail()
  @IsNotEmpty()
  readonly email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  readonly password: string;

  @IsBoolean()
  @IsNotEmpty()
  readonly agreeTerms: boolean;

  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass verified' })
  @IsOptional()
  readonly verified: boolean;

  @IsEmpty({ message: 'You cannot pass resetPasswordToken' })
  @IsOptional()
  readonly resetPasswordToken: string;

  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass vip' })
  @IsOptional()
  readonly vip: boolean;

  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass warning' })
  @IsOptional()
  readonly warning: boolean;

  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass isAdmin' })
  @IsOptional()
  readonly isAdmin: boolean;

  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass isAdmin' })
  @IsOptional()
  readonly active: boolean;

  @IsBoolean()
  @IsEmpty({ message: 'You cannot pass premium' })
  @IsOptional()
  readonly premium: boolean;

  @IsEnum(UserType, {
    message: 'Enter corect userType : personal or prganisation',
  })
  @IsNotEmpty()
  readonly accountType: UserType;

  @IsString()
  @IsOptional()
  readonly description: string;

  @IsString()
  @IsNotEmpty()
  readonly cityId: string;

  @IsString()
  @IsNotEmpty()
  readonly countryId: string;

  @IsString()
  @IsNotEmpty()
  readonly phone: string;

  @IsString()
  @IsNotEmpty()
  readonly language: string;

  @IsString()
  @IsOptional()
  readonly firstName: string;

  @IsString()
  @IsOptional()
  readonly lastName: string;

  @IsString()
  @IsOptional()
  readonly name: string;

  @IsString()
  @IsOptional()
  readonly pictureUrl: string;

  @IsString()
  @IsOptional()
  readonly coverUrl: string;

  @IsString()
  @IsOptional()
  readonly phone2: string;

  @IsString()
  @IsOptional()
  readonly whatsapp: string;

  @IsString()
  @IsOptional()
  readonly twitter: string;

  @IsString()
  @IsOptional()
  readonly instagram: string;

  @IsString()
  @IsOptional()
  readonly facebook: string;

  @IsString()
  @IsOptional()
  readonly webSite: string;

  @IsString()
  @IsOptional()
  readonly linkedIn: string;

  @IsString()
  @IsOptional()
  readonly address: string;
}
