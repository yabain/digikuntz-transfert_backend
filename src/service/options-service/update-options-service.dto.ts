/* eslint-disable prettier/prettier */
import { IsString, IsEmpty, IsOptional, IsBoolean } from 'class-validator';

export class UpdateOptionsServiceDto {
  @IsEmpty({ message: 'You cannot pass id' })
  readonly id: string;

  @IsEmpty({ message: 'You cannot pass subscriptionId' })
  readonly serviceId: string;

  @IsString()
  @IsOptional()
  readonly title: string;

  @IsBoolean()
  @IsOptional()
  readonly isActive: boolean;
}
