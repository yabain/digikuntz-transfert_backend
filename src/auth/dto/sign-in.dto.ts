import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export enum SignInType {
  EMAIL = 'email',
  PHONE = 'phone',
}

export class SignInDto {
  @ApiPropertyOptional({
    enum: SignInType,
    default: SignInType.EMAIL,
  })
  @IsOptional()
  @IsEnum(SignInType)
  type?: SignInType;

  @ApiPropertyOptional({ example: 'user@mail.com' })
  @ValidateIf((o: SignInDto) => !o.type || o.type === SignInType.EMAIL)
  @IsEmail({}, { message: 'Invalid email address' })
  email?: string;

  @ApiPropertyOptional({ example: '+237 694949617' })
  @ValidateIf((o: SignInDto) => o.type === SignInType.PHONE)
  @IsString()
  @IsNotEmpty({ message: 'WhatsApp number is required for phone sign in' })
  whatsapp?: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
