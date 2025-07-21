import { UserType } from './user.schema';
import { IsString, IsOptional, IsEmpty } from 'class-validator';

export class UpdateUserDto {
  @IsEmpty({ message: 'accountType must been empty' })
  accountType: UserType;

  @IsEmpty({ message: 'email must been empty' })
  readonly email: string;

  @IsEmpty({ message: 'password must been empty' })
  readonly password: string;

  @IsEmpty({ message: 'You cannot pass resetPasswordToken' })
  readonly resetPasswordToken: string;

  @IsEmpty({ message: 'agreeTerms must been empty' })
  readonly agreeTerms: boolean;

  @IsEmpty({ message: 'active must been empty' })
  readonly active: string;

  @IsEmpty({ message: 'verified must been empty' })
  readonly verified: boolean;

  @IsEmpty({ message: 'vip must been empty' })
  readonly vip: boolean;

  @IsEmpty({ message: 'warning must been empty' })
  readonly warning: boolean;

  @IsEmpty({ message: 'isAdmin must been empty' })
  readonly isAdmin: boolean;

  @IsEmpty({ message: 'premium must been empty' })
  readonly premium: boolean;

  @IsEmpty({ message: 'status must been empty' })
  readonly status: boolean;

  @IsString()
  @IsOptional()
  readonly description: string;

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
  readonly webSite: string;

  @IsString()
  @IsOptional()
  readonly linkedIn: string;

  @IsString()
  @IsOptional()
  readonly address: string;
}
