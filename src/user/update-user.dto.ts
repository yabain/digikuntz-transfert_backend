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

  @IsEmpty()
  @IsOptional()
  readonly portal: boolean;

  @IsOptional()
  portalServices: boolean;

  @IsOptional()
  portalSubscription: boolean;


  @IsOptional()
  portalFundraising: boolean;

  @IsOptional()
  readonly isActive: string;

  @IsOptional()
  readonly verified: boolean;

  @IsOptional()
  readonly vip: boolean;

  @IsOptional()
  readonly warning: boolean;

  @IsOptional()
  readonly isAdmin: boolean;

  @IsOptional()
  readonly premium: boolean;

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
  readonly cover: string;

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
