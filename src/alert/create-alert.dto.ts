import { IsEmpty, IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { User } from '../user/user.schema';
import { AlertType } from './alert.schema';

export class CreateAlertDto {
  @IsNotEmpty()
  readonly userId: User;

  @IsEnum(AlertType, {
    message: 'Enter corect AlertType',
  })
  @IsNotEmpty()
  alertType: AlertType;

  @IsString()
  @IsOptional()
  objectId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
