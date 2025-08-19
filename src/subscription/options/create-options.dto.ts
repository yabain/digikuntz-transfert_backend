/* eslint-disable prettier/prettier */
import { IsString, IsNotEmpty, IsEmpty, IsBoolean } from 'class-validator';

export class CreateOptionsDto {
  @IsEmpty({ message: 'You cannot pass id' })
  readonly id: string;

  @IsString()
  @IsNotEmpty()
  readonly subscriptionId: string;

  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @IsBoolean()
  @IsNotEmpty()
  readonly isActive: boolean;

  @IsString()
  @IsNotEmpty()
  readonly description: string;
}
