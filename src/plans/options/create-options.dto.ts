/* eslint-disable prettier/prettier */
import { IsString, IsNotEmpty, IsEmpty, IsBoolean } from 'class-validator';

export class CreateOptionsDto {
  @IsEmpty({ message: 'You cannot pass id' })
  readonly id: string;

  @IsString()
  @IsNotEmpty()
  readonly plansId: string;

  @IsString()
  @IsNotEmpty()
  readonly title: string;

  @IsBoolean()
  @IsNotEmpty()
  readonly isActive: boolean;
}
