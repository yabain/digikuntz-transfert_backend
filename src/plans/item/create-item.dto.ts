/* eslint-disable prettier/prettier */
import { IsString, IsNotEmpty, IsEmpty, IsBoolean } from 'class-validator';

export class CreateItemDto {
  @IsEmpty({ message: 'You cannot pass id' })
  readonly id: string;

  @IsString()
  @IsNotEmpty()
  readonly plansId: string;

  @IsString()
  @IsNotEmpty()
  readonly userId: string;

  @IsBoolean()
  @IsNotEmpty()
  readonly isActive: boolean;
}
