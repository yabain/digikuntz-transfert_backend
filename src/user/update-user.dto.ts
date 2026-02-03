/* eslint-disable prettier/prettier */
import { UserType } from './user.schema';
import { IsString, IsOptional, IsEmpty } from 'class-validator';

export class UpdateUserDto {
  @IsEmpty({ message: 'accountType must been empty' })
  @IsOptional()
  accountType: UserType;

  @IsEmpty({ message: 'email must been empty' })
  @IsOptional()
  readonly email: string;

  @IsEmpty()
  @IsOptional()
  readonly balance: number;

  @IsEmpty({ message: 'password must been empty' })
  @IsOptional()
  readonly password: string;

  @IsEmpty({ message: 'You cannot pass resetPasswordToken' })
  @IsOptional()
  readonly resetPasswordToken: string;

  @IsEmpty({ message: 'agreeTerms must been empty' })
  @IsOptional()
  readonly agreeTerms: boolean;

  @IsEmpty({ message: 'isActive must been empty' })
  @IsOptional()
  readonly isActive: string;

  @IsEmpty({ message: 'verified must been empty' })
  @IsOptional()
  readonly verified: boolean;

  @IsEmpty({ message: 'vip must been empty' })
  @IsOptional()
  readonly vip: boolean;

  @IsEmpty({ message: 'warning must been empty' })
  @IsOptional()
  readonly warning: boolean;

  @IsEmpty({ message: 'isAdmin must been empty' })
  @IsOptional()
  readonly isAdmin: boolean;

  @IsEmpty({ message: 'premium must been empty' })
  @IsOptional()
  readonly premium: boolean;

  @IsEmpty({ message: 'status must been empty' })
  @IsOptional()
  readonly status: boolean;

  @IsString()
  @IsOptional()
  readonly description: string;

  @IsString()
  @IsOptional()
  readonly gender: string; // male or female

  @IsString()
  @IsOptional()
  readonly cityId: string;

  @IsString()
  @IsOptional()
  readonly countryId: string;

  @IsString()
  @IsOptional()
  readonly language: string;

  @IsString()
  @IsOptional()
  readonly phone: string;

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
  readonly website: string;

  @IsString()
  @IsOptional()
  readonly linkedIn: string;

  @IsString()
  @IsOptional()
  readonly address: string;

  @IsString()
  @IsOptional()
  headTitlePortal: string;

  @IsString()
  @IsOptional()
  headTitlePortalColor: string

  @IsString()
  @IsOptional()
  headTextPortal: string;

  @IsString()
  @IsOptional()
  headTextPortalColor: string
}
