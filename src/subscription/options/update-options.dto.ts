/* eslint-disable prettier/prettier */
import { IsString, IsEmpty, IsOptional, IsBoolean } from 'class-validator';

export class UpdateOptionsDto {
  @IsEmpty({ message: 'You cannot pass id' })
  readonly id: string;

  @IsEmpty({ message: 'You cannot pass subscriptionId' })
  readonly subscriptionId: string;

  @IsString()
  @IsOptional()
  readonly name: string;

  @IsBoolean()
  @IsOptional()
  readonly isActive: boolean;

  @IsString()
  @IsOptional()
  readonly description: string;
}
