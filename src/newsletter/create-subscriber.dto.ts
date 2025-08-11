import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriberDto {
  @ApiProperty({
    example: 'Flambel SANOU',
    description: 'Name of the newsletter subscriber',
    minLength: 4,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  readonly name: string;

  @ApiProperty({
    example: 'address@email.com',
    description: 'Email address of the subscriber',
  })
  @IsString()
  @IsNotEmpty()
  readonly email: string;
}
