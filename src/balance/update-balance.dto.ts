/* eslint-disable prettier/prettier */
import { IsOptional, IsEmpty } from 'class-validator';
import { User } from 'src/user/user.schema';

export class UpdateUserDto {
  @IsOptional()
  userId: User;

  @IsEmpty()
  @IsOptional()
  readonly balance: number;
}
