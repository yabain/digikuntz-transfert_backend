/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { User } from 'src/user/user.schema';

export class CreateSoldeDto {
  @IsNotEmpty()
  readonly userId: User;

  @ApiProperty()
  @IsNotEmpty()
  readonly solde: number;
}
