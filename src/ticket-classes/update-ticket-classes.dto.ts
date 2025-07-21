import { IsString, IsEmpty, IsOptional } from 'class-validator';

export class UpdateTicketClassesDto {
  @IsEmpty({ message: 'You cannot pass user id' })
  readonly id: string;

  @IsEmpty({ message: 'You cannot pass user id' })
  readonly eventId: string;

  @IsString()
  @IsOptional()
  readonly name: string;

  @IsString()
  @IsOptional()
  readonly quantity: string;

  @IsString()
  @IsOptional()
  readonly taken: string;

  @IsString()
  @IsOptional()
  readonly description: string;
}
