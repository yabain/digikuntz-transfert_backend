/* eslint-disable prettier/prettier */
import { IsEmpty, IsOptional, IsBoolean } from 'class-validator';

export class UpdateItemDto {
  @IsEmpty({ message: 'You cannot pass id' })
  readonly id: string;

  @IsEmpty({ message: 'You cannot pass plansId' })
  readonly plansId: string;

  @IsEmpty({ message: 'You cannot pass usernId' })
  readonly usernId: string;

  @IsBoolean()
  @IsOptional()
  readonly isActive: boolean;
}
