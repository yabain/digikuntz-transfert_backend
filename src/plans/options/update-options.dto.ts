/* eslint-disable prettier/prettier */
import { IsString, IsEmpty, IsOptional, IsBoolean } from 'class-validator';

export class UpdateOptionsDto {
  @IsEmpty({ message: 'You cannot pass id' })
  readonly id: string;

  @IsEmpty({ message: 'You cannot pass subscriptionId' })
  readonly plansId: string;

  @IsString()
  @IsOptional()
  readonly title: string;

  @IsBoolean()
  @IsOptional()
  readonly isActive: boolean;
}
